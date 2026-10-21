// 自選影片跟練畫面：左（或上）播放使用者選的示範影片、右（或下）鏡頭＋骨架，邊播邊比對。
// 流程：站位檢查 → 倒數 3 秒 → 影片從頭播到尾 → 成績。比對與計分在 follow/follow-scorer.ts。
import type { AppConfig } from '../../config/load';
import { checkSetup, pointsForAngles, SetupGate } from '../../engine/setup-check';
import { browserSpeaker, VoiceCoach } from '../../feedback/voice';
import { correctionText } from '../../feedback/voice-phrases';
import { FollowScorer, type FollowMoment, type FollowSummary } from '../../follow/follow-scorer';
import { onVideoFrame, playVideo, type VideoSource } from '../../input/video-source';
import { getEstimator, PosePipeline } from '../../pose/pipeline';
import type { PoseFrame } from '../../pose/types';
import { decodeReference } from '../../reference/reference-data';
import type { SavedVideo } from '../../storage/video-library';
import { el } from '../dom';
import { drawSkeleton } from '../skeleton';
import { COLORS, segmentColorer } from '../practice/draw';
import { ProgressRing } from '../practice/ring';
import '../practice/practice.css';
import './follow.css';

export interface FollowOptions {
  config: AppConfig;
  saved: SavedVideo;
  /** 示範影片（已在點擊當下「解鎖」過，可以有聲音播放） */
  refVideo: HTMLVideoElement;
  source: VideoSource;
  onExit(): void;
  onFinish(summary: FollowSummary): void;
}

const UI_UPDATE_MS = 150;
const SPEEDS = [0.5, 0.75, 1] as const;
const COUNTDOWN_SEC = 3;
/** 畫面上的即時分數：最近幾秒的平均 */
const LIVE_WINDOW = 25;

/**
 * 在「開始跟練」的點擊當下呼叫：建立示範影片並先播一下再暫停，之後才能自動播放（含聲音）。
 * iPhone 規定有聲音的播放要由使用者點擊觸發。
 */
export function unlockedVideo(src: Blob): HTMLVideoElement {
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.src = URL.createObjectURL(src);
  void v
    .play()
    .then(() => v.pause())
    .catch(() => {});
  return v;
}

export function showFollow(root: HTMLElement, opts: FollowOptions): void {
  const { config, saved, refVideo, source } = opts;
  const { settings } = config;
  const minVis = settings.judge.minVisibility;
  const selfie = source.kind === 'camera' && settings.display.selfieView;
  const reference = decodeReference(saved.analysis, settings.display.mirrorMode);
  const scorer = new FollowScorer(reference, { follow: settings.follow, scoring: settings.scoring, angles: config.angles, minVisibility: minVis });

  // ── 語音：說話時把影片聲音調小 ──
  const speaker = browserSpeaker(settings.voice, (talking) => (refVideo.volume = talking ? 0.3 : 1));
  const coach = new VoiceCoach(speaker ?? { speak: () => {}, cancel: () => {} }, {
    correctionIntervalMs: settings.voice.correctionIntervalSec * 1000,
    repeatSameMs: settings.voice.repeatSameSec * 1000,
    minPersistMs: settings.voice.minPersistMs,
    notVisibleIntervalMs: settings.voice.notVisibleIntervalSec * 1000,
  });
  coach.setEnabled(speaker !== null);

  // ── 版面（沿用練習畫面的樣式） ──
  const title = el('h1', { class: 'pr-step-name' }, saved.name);
  const sub = el('p', { class: 'pr-step-desc' }, '自選影片跟練');
  const timeBar = el('div', { class: 'fv-time' }, el('div', { class: 'fv-time-fill' }));
  const timeText = el('span', { class: 'fv-time-text' });
  const soundButton = el('button', { class: 'pr-icon-btn', title: '影片聲音開／關' }, '🎵');
  const voiceButton = el('button', { class: 'pr-icon-btn', title: '語音提示開／關' }, coach.enabled ? '🔊' : '🔇');
  voiceButton.hidden = speaker === null;
  const exitButton = el('button', { class: 'pr-icon-btn', title: '結束' }, '✕');

  refVideo.className = 'pr-ref-video';
  const refCanvas = el('canvas', { class: 'pr-canvas' });
  const ring = new ProgressRing();
  let speed = 1;
  const speedButtons = SPEEDS.map((s) => el('button', { class: 'pr-speed-btn', 'data-speed': String(s) }, `${s}×`));
  const speedBar = el('div', { class: 'pr-speed' }, el('span', {}, '速度'), ...speedButtons);
  const userCanvas = el('canvas', { class: 'overlay' });
  const userStage = el('div', { class: `stage${selfie ? ' mirrored' : ''}` }, source.video, userCanvas);
  const skipSetupButton = el('button', { class: 'pr-skip-setup', hidden: '' }, '略過檢查 ▶');
  const countdown = el('div', { class: 'fv-countdown', hidden: '' });
  const feedback = el('div', { class: 'pr-feedback' }, '載入姿態模型中…');

  root.replaceChildren(
    el(
      'div',
      { class: 'practice follow' },
      el(
        'header',
        { class: 'pr-header' },
        el('div', { class: 'pr-title' }, title, sub, el('div', { class: 'fv-time-row' }, timeBar, timeText)),
        el('div', { class: 'pr-tools' }, soundButton, voiceButton, exitButton),
      ),
      el(
        'section',
        { class: 'pr-panels' },
        el('div', { class: 'pr-panel pr-ref' }, refVideo, refCanvas, el('span', { class: 'pr-label' }, '示範影片'), ring.element, speedBar),
        el('div', { class: 'pr-panel pr-user' }, userStage, el('span', { class: 'pr-label' }, '你的動作'), skipSetupButton, countdown),
      ),
      feedback,
    ),
  );

  // ── 狀態 ──
  type Phase = 'loading' | 'setup' | 'countdown' | 'playing' | 'done';
  let phase: Phase = 'loading';
  let countdownEnd = 0;
  let stopLoop = () => {};
  let closed = false;
  let lastUi = 0;
  const live: number[] = [];
  const gate = new SetupGate(settings.setup.holdMs);
  const required = pointsForAngles(settings.follow.angles.map((id) => config.angles[id]!).filter(Boolean));

  const close = () => {
    if (closed) return;
    closed = true;
    stopLoop();
    source.stop();
    refVideo.pause();
    URL.revokeObjectURL(refVideo.src);
    speaker?.cancel();
  };

  exitButton.addEventListener('click', () => {
    close();
    opts.onExit();
  });
  soundButton.addEventListener('click', () => {
    refVideo.muted = !refVideo.muted;
    soundButton.textContent = refVideo.muted ? '🔕' : '🎵';
  });
  voiceButton.addEventListener('click', () => {
    coach.setEnabled(!coach.enabled);
    voiceButton.textContent = coach.enabled ? '🔊' : '🔇';
  });
  const applySpeed = () => {
    refVideo.playbackRate = speed;
    speedButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset['speed']) === speed));
  };
  speedBar.addEventListener('click', (e) => {
    const s = Number((e.target as HTMLElement).dataset['speed']);
    if (s) (speed = s), applySpeed();
  });
  applySpeed();

  const startCountdown = () => {
    if (phase !== 'setup') return;
    phase = 'countdown';
    skipSetupButton.hidden = true;
    countdownEnd = performance.now() + COUNTDOWN_SEC * 1000;
    refVideo.currentTime = 0;
    coach.stepStart('準備開始', performance.now());
  };
  skipSetupButton.addEventListener('click', startCountdown);

  const finish = () => {
    if (phase === 'done') return;
    phase = 'done';
    close();
    opts.onFinish(scorer.summary(refVideo.duration || saved.durationSec));
  };
  refVideo.addEventListener('ended', finish);

  // ── 畫面繪製 ──
  const drawRef = () => {
    const { width, height, area } = saved.analysis;
    if (refCanvas.width !== width || refCanvas.height !== height) {
      refCanvas.width = width;
      refCanvas.height = height;
    }
    const ctx = refCanvas.getContext('2d')!;
    ctx.fillStyle = '#e8eef0';
    ctx.fillRect(0, 0, width, height);
    if (refVideo.readyState >= 2) {
      const vw = refVideo.videoWidth;
      ctx.drawImage(refVideo, vw * area[0], 0, vw * (area[1] - area[0]), refVideo.videoHeight, 0, 0, width, height);
    }
  };

  const drawUser = (frame: PoseFrame | null, m: FollowMoment | null, color: string = COLORS.neutral) => {
    const { videoWidth: w, videoHeight: h } = source.video;
    if (userCanvas.width !== w || userCanvas.height !== h) {
      userCanvas.width = w;
      userCanvas.height = h;
    }
    const ctx = userCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!frame) return;
    const checks = (m?.checks ?? []).map((c) => ({ id: c.id, value: c.diff, inRange: c.ok }));
    drawSkeleton(ctx, frame, {
      color,
      lineWidth: (h * settings.display.skeletonWidth) / 100,
      minVisibility: minVis,
      segmentColor: m ? segmentColorer(checks, config) : undefined,
    });
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ── 每一幀 ──
  const onFrame = (pipeline: PosePipeline) => {
    const w = source.video.videoWidth;
    const h = source.video.videoHeight;
    if (!w || !h || closed) return;
    const t0 = performance.now();
    const frame = pipeline.process(source.video, w, h, t0);
    drawRef();
    const uiTick = t0 - lastUi > UI_UPDATE_MS;
    if (uiTick) lastUi = t0;

    if (phase === 'setup') {
      const res = checkSetup(frame, required, minVis, settings.setup.minBodyHeight);
      if (gate.update(res.ok, t0)) return startCountdown();
      drawUser(frame, null, res.ok ? COLORS.ok : COLORS.neutral);
      if (uiTick) {
        ring.set(gate.progress(t0), res.ok ? '✓' : '…', '');
        feedback.className = `pr-feedback ${res.ok ? 'good' : 'warn'}`;
        feedback.textContent = res.ok ? '很好，保持不動…' : res.tooFar ? '再靠近一點' : `請讓全身入鏡（看不到：${res.missing.slice(0, 3).join('、')}）`;
        if (res.tooFar) coach.tooFar(t0);
        else if (!res.ok) coach.notVisible(t0);
      }
      return;
    }

    if (phase === 'countdown') {
      drawUser(frame, null);
      const left = Math.ceil((countdownEnd - t0) / 1000);
      countdown.hidden = false;
      countdown.textContent = String(Math.max(left, 1));
      feedback.className = 'pr-feedback good';
      feedback.textContent = '準備，跟著示範一起做！';
      if (t0 >= countdownEnd) {
        countdown.hidden = true;
        phase = 'playing';
        void refVideo.play().catch(() => {
          feedback.textContent = '⚠ 影片無法自動播放，請點一下示範影片';
          refCanvas.addEventListener('click', () => void refVideo.play(), { once: true });
        });
      }
      return;
    }

    if (phase !== 'playing') return;
    const videoT = refVideo.currentTime;
    const m = scorer.evaluate(frame, videoT);
    if (!refVideo.paused) scorer.record(m, videoT);
    drawUser(frame, m);
    if (m.score !== null) {
      live.push(m.score);
      if (live.length > LIVE_WINDOW) live.shift();
    }

    if (uiTick) {
      const duration = refVideo.duration || saved.durationSec;
      (timeBar.firstChild as HTMLElement).style.width = `${(videoT / duration) * 100}%`;
      timeText.textContent = `${fmt(videoT)} / ${fmt(duration)}`;
      const avg = live.length ? Math.round(live.reduce((a, b) => a + b, 0) / live.length) : null;
      ring.set((avg ?? 0) / 100, avg === null ? '—' : String(avg), avg === null ? '' : '分');
      if (!frame) {
        feedback.className = 'pr-feedback warn';
        feedback.textContent = '看不到人：請站到鏡頭前，讓全身入鏡';
        coach.notVisible(t0);
      } else if (m.worst) {
        feedback.className = 'pr-feedback bad';
        feedback.replaceChildren(el('span', { class: 'pr-fix' }, el('b', {}, `${m.worst.name} 差 ${Math.abs(m.worst.diff).toFixed(0)}°`), '　跟著示範調整'));
        coach.correction(correctionText(undefined, m.worst.name), t0);
      } else {
        feedback.className = 'pr-feedback good';
        feedback.textContent = m.score === null ? '跟著示範一起做 💪' : '跟得很好！💪';
        coach.correction('', t0);
      }
    }
  };

  // ── 開始 ──
  playVideo(source.video).catch((err: unknown) => {
    feedback.textContent = `⚠ ${err instanceof Error ? err.message : String(err)}`;
  });
  getEstimator(settings.pose)
    .then((estimator) => {
      if (closed) return;
      const pipeline = new PosePipeline(estimator, settings.pose);
      phase = 'setup';
      skipSetupButton.hidden = false;
      if (!settings.setup.enabled) startCountdown();
      if (import.meta.env.DEV) (window as unknown as { __followTick?: () => void }).__followTick = () => onFrame(pipeline);
      stopLoop = onVideoFrame(source.video, () => {
        try {
          onFrame(pipeline);
        } catch (err) {
          stopLoop();
          feedback.className = 'pr-feedback warn';
          feedback.textContent = `⚠ 發生錯誤：${err instanceof Error ? err.message : String(err)}`;
          console.error(err);
        }
      });
    })
    .catch((err: unknown) => {
      feedback.className = 'pr-feedback warn';
      feedback.textContent = `⚠ ${err instanceof Error ? err.message : String(err)}`;
    });
}

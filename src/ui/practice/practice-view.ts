// 練習畫面：左（或上）標準動作、右（或下）使用者即時畫面，一次進行一步。
// 這裡只負責「接線＋顯示」：判定在 engine/、差異計算在 feedback/、角度在 angles/。
import { angleValue } from '../../angles/compute';
import type { AppConfig } from '../../config/load';
import { Session, type StepView } from '../../engine/step-engine';
import { alignToReference, arrowSymbol, correctionArrow, topCorrections, type Arrow } from '../../feedback/feedback';
import { onVideoFrame, playVideo, type VideoSource } from '../../input/video-source';
import { getEstimator, PosePipeline } from '../../pose/pipeline';
import type { PoseFrame } from '../../pose/types';
import { frameAt, referenceVideoUrl, stepClip, type ReferenceData, type StepTargets } from '../../reference/reference-data';
import { el } from '../dom';
import { PerfMeter } from '../perf-meter';
import { drawSkeleton } from '../skeleton';
import { COLORS, drawArrow, flipHorizontal, segmentColorer } from './draw';
import { DebugPanel } from './debug-panel';
import { ProgressRing } from './ring';
import './practice.css';

export interface PracticeOptions {
  config: AppConfig;
  source: VideoSource;
  reference: ReferenceData;
  targets: StepTargets[];
  onExit(): void;
  onFinish(session: Session): void;
}

const UI_UPDATE_MS = 120;
const SPEEDS = [0.5, 0.6, 0.8, 1] as const;
const SPEED_KEY = 'fitness-coach.reference-speed';

function loadSpeed(fallback: number): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveSpeed(v: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    /* 無法使用瀏覽器儲存時，只在這次練習有效 */
  }
}
const TOAST_MS = 1500;

export function showPractice(root: HTMLElement, opts: PracticeOptions): void {
  const { config, source, reference, targets } = opts;
  const { settings } = config;
  const steps = config.routine.steps;
  const mirror = settings.display.mirrorMode === 'mirror';
  const selfie = source.kind === 'camera' && settings.display.selfieView;
  const minVis = settings.judge.minVisibility;

  // ── 版面 ──
  const stepNo = el('span', { class: 'pr-step-no' });
  const stepName = el('h1', { class: 'pr-step-name' });
  const stepDesc = el('p', { class: 'pr-step-desc' });
  const dots = el('ol', { class: 'pr-dots' }, ...steps.map((s) => el('li', { title: s.name })));
  const debugButton = el('button', { class: 'pr-icon-btn', title: '除錯面板（快捷鍵 D）' }, '🐞');
  const exitButton = el('button', { class: 'pr-icon-btn', title: '結束練習' }, '✕');

  const refCanvas = el('canvas', { class: 'pr-canvas' });
  const refVideoUrl = referenceVideoUrl(reference.file.video);
  const refVideo = el('video', { class: 'pr-ref-video', muted: '', playsinline: '', preload: 'auto' });
  refVideo.muted = true;
  const ring = new ProgressRing();
  // 示範影片的播放速度（記在這台裝置上；沒選過就用 settings.json 的預設值）
  let speed = loadSpeed(settings.display.referenceSpeed);
  const speedButtons = SPEEDS.map((s) => el('button', { class: 'pr-speed-btn', 'data-speed': String(s) }, `${s}×`));
  const speedBar = el('div', { class: 'pr-speed' }, el('span', {}, '速度'), ...speedButtons);
  // 示範影片來源（每一步換一次）：優先用剪好的片段（正式網站也有），其次整支影片（只在開發時有）
  // 都沒有時才改畫示範者骨架，避免畫面空白
  let hasRefVideo = false;
  let refOffset = 0;
  let drawRefSkeleton = settings.display.referenceSkeleton;

  const userCanvas = el('canvas', { class: 'overlay' });
  const userStage = el('div', { class: `stage${selfie ? ' mirrored' : ''}` }, source.video, userCanvas);
  const checkpointChips = el('div', { class: 'pr-checkpoints' });

  const feedback = el('div', { class: 'pr-feedback' });
  const toast = el('div', { class: 'pr-toast', hidden: '' });
  const relaxButton = el('button', { class: 'primary' }, '放寬標準再試');
  const skipButton = el('button', {}, '跳過這一步');
  const stuckBox = el(
    'div',
    { class: 'pr-stuck', hidden: '' },
    el(
      'div',
      { class: 'pr-stuck-card' },
      el('h2', {}, '這一步好像有點難'),
      el('p', {}, `可以放寬標準（容許角度 +${settings.giveUp.relaxExtraDeg}°）再試一次，或先跳過。報告中會標記。`),
      el('div', { class: 'actions' }, relaxButton, skipButton),
    ),
  );
  const debug = new DebugPanel(config, source);

  root.replaceChildren(
    el(
      'div',
      { class: 'practice' },
      el('header', { class: 'pr-header' }, el('div', { class: 'pr-title' }, stepNo, stepName, stepDesc), dots, el('div', { class: 'pr-tools' }, debugButton, exitButton)),
      el(
        'section',
        { class: 'pr-panels' },
        el('div', { class: 'pr-panel pr-ref' }, refVideo, refCanvas, el('span', { class: 'pr-label' }, '標準動作'), ring.element, speedBar),
        el('div', { class: 'pr-panel pr-user' }, userStage, el('span', { class: 'pr-label' }, '你的動作'), checkpointChips),
      ),
      feedback,
      toast,
      stuckBox,
      debug.element,
    ),
  );

  // ── 狀態 ──
  let session: Session | null = null;
  let stepIndex = -1;
  let clipStartT = performance.now();
  let stopLoop = () => {};
  let closed = false;
  let lastUi = 0;
  let toastTimer = 0;
  let stuckDismissedAt = -1;
  const perf = new PerfMeter();

  const close = () => {
    if (closed) return;
    closed = true;
    stopLoop();
    source.stop();
    refVideo.pause();
    refVideo.removeAttribute('src');
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'd' || e.key === 'D') debug.toggle();
  };
  window.addEventListener('keydown', onKey);
  debugButton.addEventListener('click', () => debug.toggle());
  exitButton.addEventListener('click', () => {
    close();
    opts.onExit();
  });
  const applySpeed = () => {
    refVideo.playbackRate = speed;
    for (const b of speedButtons) b.classList.toggle('active', Number(b.dataset['speed']) === speed);
  };
  speedBar.addEventListener('click', (e) => {
    const s = Number((e.target as HTMLElement).dataset['speed']);
    if (!s) return;
    speed = s;
    saveSpeed(s);
    applySpeed();
  });
  refVideo.addEventListener('loadedmetadata', applySpeed);
  applySpeed();

  const loadReferenceVideo = (stepIndex: number) => {
    const step = steps[stepIndex]!;
    const clip = stepClip(step, reference.file.video);
    const src = clip?.url ?? refVideoUrl;
    hasRefVideo = src !== null;
    refOffset = clip?.offset ?? 0;
    drawRefSkeleton = settings.display.referenceSkeleton || !hasRefVideo;
    if (!src) return;
    if (refVideo.getAttribute('src') !== src) refVideo.src = src;
    const seek = () => (refVideo.currentTime = Math.max(0, step.clip[0] - refOffset));
    if (refVideo.readyState >= 1) seek();
    else refVideo.addEventListener('loadedmetadata', seek, { once: true });
    void refVideo.play().catch(() => {});
  };
  relaxButton.addEventListener('click', () => {
    session?.relax(settings.giveUp.relaxExtraDeg, performance.now());
    stuckBox.hidden = true;
  });
  skipButton.addEventListener('click', () => {
    if (!session) return;
    const ev = session.skip(performance.now());
    stuckBox.hidden = true;
    if (ev) showToast(`已跳過「${ev.result.name}」`);
    if (session.finished) finish();
  });

  const showToast = (text: string) => {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), TOAST_MS);
  };

  const finish = () => {
    close();
    opts.onFinish(session!);
  };

  const enterStep = (i: number) => {
    stepIndex = i;
    const step = steps[i]!;
    stepNo.textContent = `第 ${i + 1} / ${steps.length} 步`;
    stepName.textContent = step.name;
    stepDesc.textContent = step.description ?? '';
    [...dots.children].forEach((d, j) => {
      const r = session?.results[j];
      d.className = j === i ? 'current' : r ? (r.outcome === 'passed' ? 'done' : 'skipped') : '';
    });
    checkpointChips.replaceChildren(
      ...(step.type === 'dynamic' ? step.checkpoints.map((c) => el('span', { class: 'pr-cp' }, c.name)) : []),
    );
    checkpointChips.hidden = step.type !== 'dynamic';
    clipStartT = performance.now();
    loadReferenceVideo(i);
    stuckBox.hidden = true;
    stuckDismissedAt = -1;
  };

  // ── 標準畫面的時間（循環播放這一步的示範片段） ──
  const referenceTime = (now: number): number => {
    const [a, b] = steps[stepIndex]!.clip;
    if (hasRefVideo && refVideo.readyState >= 2) {
      const t = refVideo.currentTime + refOffset;
      if (t >= b - 0.05 || t < a - 0.5 || refVideo.ended) {
        refVideo.currentTime = a - refOffset;
        if (refVideo.paused) void refVideo.play().catch(() => {});
      }
      return t;
    }
    return a + ((((now - clipStartT) / 1000) * speed) % (b - a));
  };

  // ── 每一幀 ──
  const onFrame = (pipeline: PosePipeline) => {
    const video = source.video;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h || !session) return;
    const t0 = performance.now();
    const frame = pipeline.process(video, w, h, t0);

    const step = steps[stepIndex]!;
    const readings: Record<string, number | null> = {};
    for (const a of step.angles) readings[a.id] = frame ? angleValue(a.def, frame, minVis) : null;
    const { view, event } = session.update(t0, readings);

    if (event) {
      showToast(event.type === 'passed' ? `✓ ${event.result.name} 完成！` : `已跳過「${event.result.name}」`);
      if (session.finished) return finish();
      enterStep(session.stepIndex);
      return;
    }

    const corrections = topCorrections(view.checks);
    drawUser(frame, view, corrections.map((c) => c.id));
    const refT = referenceTime(t0);
    drawReference(frameAt(reference, refT), frame, view, corrections.map((c) => c.id));

    const t1 = performance.now();
    perf.record(t1, t1 - t0);
    if (t1 - lastUi > UI_UPDATE_MS) {
      lastUi = t1;
      updateUi(frame, view, corrections);
      debug.update(view, perf, stepIndex, pipeline.estimator.delegate, pipeline.estimator.model);
    }
  };

  const arrowsFor = (frame: PoseFrame, view: StepView, ids: string[]): Arrow[] =>
    ids.flatMap((id) => {
      const c = view.checks.find((x) => x.id === id)!;
      const a = correctionArrow(config.angles[id]!, frame, c.target, minVis);
      return a ? [a] : [];
    });

  const drawUser = (frame: PoseFrame | null, view: StepView, badIds: string[]) => {
    const { videoWidth: w, videoHeight: h } = source.video;
    if (userCanvas.width !== w || userCanvas.height !== h) {
      userCanvas.width = w;
      userCanvas.height = h;
    }
    const ctx = userCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!frame) return;
    const lw = (h * settings.display.skeletonWidth) / 100;
    drawSkeleton(ctx, frame, { color: COLORS.neutral, lineWidth: lw, minVisibility: minVis, segmentColor: segmentColorer(view.checks, config) });
    for (const a of arrowsFor(frame, view, badIds)) drawArrow(ctx, a, lw * 0.8);
  };

  const drawReference = (refFrame: PoseFrame | null, userFrame: PoseFrame | null, view: StepView, badIds: string[]) => {
    const { width, height } = reference.file;
    if (refCanvas.width !== width || refCanvas.height !== height) {
      refCanvas.width = width;
      refCanvas.height = height;
    }
    const ctx = refCanvas.getContext('2d')!;
    ctx.fillStyle = '#e8eef0';
    ctx.fillRect(0, 0, width, height);
    if (hasRefVideo && refVideo.readyState >= 2) {
      const [a0, a1] = reference.file.area;
      const vw = refVideo.videoWidth;
      ctx.drawImage(refVideo, vw * a0, 0, vw * (a1 - a0), refVideo.videoHeight, 0, 0, width, height);
    }
    if (!refFrame || !drawRefSkeleton) return;
    const lw = (height * settings.display.skeletonWidth) / 100;
    // 標準骨架已換成「練習者的左右」；鏡像模式下畫的時候翻回來，才會和示範者的影像重疊
    if (mirror) flipHorizontal(ctx);
    else ctx.save();
    drawSkeleton(ctx, refFrame, { color: COLORS.neutral, lineWidth: lw, minVisibility: minVis, segmentColor: segmentColorer(view.checks, config) });
    const aligned = userFrame ? alignToReference(userFrame, refFrame) : null;
    if (aligned) {
      drawSkeleton(ctx, aligned, { color: COLORS.overlay, lineWidth: lw * 0.6, minVisibility: minVis, alpha: 0.55 });
      for (const a of arrowsFor(aligned, view, badIds)) drawArrow(ctx, a, lw * 0.7);
    }
    ctx.restore();
  };

  const updateUi = (frame: PoseFrame | null, view: StepView, corrections: ReturnType<typeof topCorrections>) => {
    const step = view.step;
    // 進度圓環
    if (step.type === 'static') {
      const remain = Math.max(0, (step.holdMs - view.heldMs) / 1000);
      ring.set(view.heldMs / step.holdMs, view.allInRange ? remain.toFixed(1) : `${(step.holdMs / 1000).toFixed(1)}`, '秒');
    } else {
      ring.set(view.reps / step.reps, `${view.reps}/${step.reps}`, '次');
      [...checkpointChips.children].forEach((c, i) => c.classList.toggle('current', i === view.checkpointIndex));
    }

    // 下方提示
    let cls = 'pr-feedback';
    let content: (string | HTMLElement)[];
    if (!frame) {
      content = ['看不到人：請站到鏡頭前 2～3 公尺，讓全身入鏡'];
      cls += ' warn';
    } else if (!view.visible) {
      const unseen = view.checks.filter((c) => c.value === null).map((c) => c.name);
      content = [`請讓全身入鏡（看不清楚：${unseen.join('、')}）`];
      cls += ' warn';
    } else if (corrections.length > 0) {
      cls += ' bad';
      content = corrections.map((c) => {
        const arrow = frame ? correctionArrow(config.angles[c.id]!, frame, view.checks.find((x) => x.id === c.id)!.target, minVis) : null;
        return el(
          'span',
          { class: 'pr-fix' },
          el('b', {}, `${c.name} 差 ${Math.abs(c.diff).toFixed(0)}° ${arrow ? arrowSymbol(arrow, selfie) : ''}`),
          c.hint ? ` ${c.hint}` : '',
        );
      });
    } else if (step.type === 'static') {
      cls += ' good';
      content = ['很好！保持住 💪'];
    } else {
      cls += ' good';
      const next = step.checkpoints[view.checkpointIndex];
      content = [`很好！下一個：${next?.name ?? ''}`];
    }
    if (step.type === 'dynamic' && corrections.length > 0) {
      content.unshift(el('span', { class: 'pr-target' }, `目標：${step.checkpoints[view.checkpointIndex]?.name ?? ''}`));
    }
    feedback.className = cls;
    feedback.replaceChildren(...content);

    // 做不到時的出口
    if (view.stuck && stuckBox.hidden && stuckDismissedAt !== stepIndex) {
      stuckBox.hidden = false;
      stuckDismissedAt = stepIndex;
    } else if (!view.stuck && !stuckBox.hidden) {
      stuckBox.hidden = true;
    }
  };

  // ── 開始 ──
  feedback.textContent = '載入姿態模型中…';
  playVideo(source.video).catch((err: unknown) => {
    feedback.textContent = `⚠ ${err instanceof Error ? err.message : String(err)}`;
    userStage.addEventListener('click', () => void source.video.play(), { once: true });
  });
  getEstimator(settings.pose)
    .then((estimator) => {
      if (closed) return;
      const pipeline = new PosePipeline(estimator, settings.pose);
      session = new Session(steps, targets, { hysteresisDeg: settings.judge.hysteresisDeg, repTimeoutSec: settings.judge.repTimeoutSec }, performance.now());
      enterStep(0);
      // 開發測試用：瀏覽器分頁看不到時影片不會播放，可從主控台呼叫 __practiceTick() 手動推進一幀
      if (import.meta.env.DEV) (window as unknown as { __practiceTick?: () => void }).__practiceTick = () => onFrame(pipeline);
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

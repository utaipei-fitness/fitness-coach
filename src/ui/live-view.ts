// 即時骨架畫面（階段 1）：影像＋骨架、FPS 與每幀處理時間。
// 階段 4 會變成左右並排的練習畫面。
import type { AppConfig } from '../config/load';
import { onVideoFrame, playVideo, type VideoSource } from '../input/video-source';
import { getEstimator, PosePipeline } from '../pose/pipeline';
import { el } from './dom';
import { PerfMeter } from './perf-meter';
import { drawSkeleton } from './skeleton';

const HUD_UPDATE_MS = 250;

export function showLiveView(root: HTMLElement, config: AppConfig, source: VideoSource, onExit: () => void): void {
  const { settings } = config;
  const { video } = source;

  const canvas = el('canvas', { class: 'overlay' });
  const stage = el('div', { class: 'stage' }, video, canvas);
  // 自拍鏡像只影響顯示（整個畫面左右翻轉），不影響計算
  if (source.kind === 'camera' && settings.display.selfieView) stage.classList.add('mirrored');

  const perfText = el('div', { class: 'hud hud-perf' }, `${source.label}`);
  const message = el('div', { class: 'hud hud-msg' }, '載入姿態模型中…');
  const exitButton = el('button', { class: 'hud-exit' }, '✕ 返回');
  root.replaceChildren(el('div', { class: 'live' }, stage, perfText, message, exitButton));

  let stopLoop = () => {};
  let closed = false;
  const showMessage = (text: string, isError = false) => {
    message.textContent = text;
    message.hidden = text === '';
    message.classList.toggle('error', isError);
  };

  playVideo(video).catch((err: unknown) => {
    showMessage(`⚠ ${err instanceof Error ? err.message : String(err)}`, true);
    stage.addEventListener('click', () => void video.play().then(() => showMessage('')), { once: true });
  });

  exitButton.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    stopLoop();
    source.stop();
    onExit();
  });

  getEstimator(settings.pose)
    .then((estimator) => {
      if (closed) return;
      const pipeline = new PosePipeline(estimator, settings.pose);
      const ctx = canvas.getContext('2d')!;
      const perf = new PerfMeter();
      let lastHud = 0;

      stopLoop = onVideoFrame(video, () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w === 0 || h === 0) return;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const t0 = performance.now();
        let frame;
        try {
          frame = pipeline.process(video, w, h, t0);
        } catch (err) {
          stopLoop();
          showMessage(`⚠ 姿態估計發生錯誤：${err instanceof Error ? err.message : String(err)}`, true);
          return;
        }
        ctx.clearRect(0, 0, w, h);
        if (frame) {
          drawSkeleton(ctx, frame, {
            color: '#4fc3f7',
            lineWidth: (h * settings.display.skeletonWidth) / 100,
            minVisibility: settings.judge.minVisibility,
          });
        }
        const t1 = performance.now();
        perf.record(t1, t1 - t0);

        if (t1 - lastHud > HUD_UPDATE_MS) {
          lastHud = t1;
          perfText.textContent =
            `FPS ${perf.fps} ・ 每幀 ${perf.avgMs.toFixed(0)} ms ・ ${estimator.delegate} ・ ${estimator.model} ・ ${w}×${h}`;
          showMessage(frame ? '' : '沒有偵測到人，請站到鏡頭前、讓全身入鏡');
        }
      });
    })
    .catch((err: unknown) => {
      showMessage(`⚠ ${err instanceof Error ? err.message : String(err)}`, true);
    });
}

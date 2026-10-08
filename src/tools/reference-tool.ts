// 標準動作建置工具（只在開發時使用：npm run dev 後開 /tools/reference.html）
//   1. 逐幀擷取標準影片中示範者的骨架，存到 generated/reference-poses.json
//   2. 播放影片時顯示目前時間與各角度，方便找出每一步的時間點填進 routine.json
//   3. 列出依 routine.json 時間點算出的每一步目標角度
import '../style.css';
import './reference-tool.css';
import { angleValue } from '../angles/compute';
import { loadBundledConfig } from '../config/bundled';
import type { AppConfig } from '../config/load';
import { PoseEstimator } from '../pose/estimator';
import { PosePipeline } from '../pose/pipeline';
import {
  computeTargets,
  decodeReference,
  encodeFrame,
  frameAt,
  loadReferenceFile,
  referenceVideoUrl,
  staleReason,
  type ReferenceData,
  type ReferenceFile,
} from '../reference/reference-data';
import { renderConfigErrors } from '../ui/config-error-view';
import { el } from '../ui/dom';
import { drawSkeleton } from '../ui/skeleton';

const root = document.querySelector<HTMLElement>('#app')!;
const result = loadBundledConfig();
if (!result.ok) renderConfigErrors(root, result.errors);
else void start(result.config);

async function start(config: AppConfig): Promise<void> {
  const { reference } = config.routine;
  const video = el('video', { controls: '', playsinline: '', muted: '', preload: 'auto' });
  video.muted = true;
  video.src = referenceVideoUrl(reference.video) ?? '';

  const status = el('div', { class: 'tool-status' });
  const extractButton = el('button', { class: 'primary' }, '擷取整支影片的骨架');
  const progress = el('span', { class: 'muted' });
  const timeLabel = el('div', { class: 'tool-time' }, '0.00 秒');
  const copyButton = el('button', {}, '複製時間');
  const prevButton = el('button', {}, '◀ 上一幀');
  const nextButton = el('button', {}, '下一幀 ▶');
  const crop = el('canvas', { class: 'tool-crop' });
  const angleTable = el('table', { class: 'tool-angles' });
  const stepsBox = el('div');

  root.replaceChildren(
    el(
      'main',
      { class: 'tool' },
      el('h1', {}, '標準動作建置工具'),
      el(
        'p',
        { class: 'muted' },
        `影片：assets/reference/${reference.video} ・ 示範者範圍 ${reference.area.join('～')} ・ 每秒 ${reference.fps} 幀 ・ 模型 ${config.settings.pose.model}`,
      ),
      status,
      el('div', { class: 'actions' }, extractButton, progress),
      el(
        'div',
        { class: 'tool-player' },
        el('div', {}, video, el('div', { class: 'actions' }, timeLabel, prevButton, nextButton, copyButton)),
        el('div', {}, el('div', { class: 'muted' }, '示範者骨架（擷取後顯示）'), crop),
        el('div', {}, el('div', { class: 'muted' }, '目前時間的角度（左右 = 練習者自己的左右）'), angleTable),
      ),
      el('h2', {}, '各步驟的目標角度（依 routine.json 的時間點自動計算）'),
      stepsBox,
    ),
  );

  let ref: ReferenceData | null = null;
  const refresh = async (file: ReferenceFile | null) => {
    if (!file) {
      status.className = 'tool-status warn';
      status.textContent = '⚠ 還沒有擷取過骨架，請按下方按鈕擷取（約需數分鐘）。';
      ref = null;
    } else {
      ref = decodeReference(file, config.settings.display.mirrorMode);
      const stale = staleReason(file, config);
      const found = file.frames.filter(Boolean).length;
      status.className = stale ? 'tool-status warn' : 'tool-status ok';
      status.textContent = stale
        ? `⚠ ${stale}，請重新擷取。`
        : `✅ 已擷取 ${file.frames.length} 幀（${found} 幀偵測到人）。`;
    }
    renderSteps(stepsBox, config, ref);
    drawCurrent();
  };

  const drawCurrent = () => {
    const t = video.currentTime;
    timeLabel.textContent = `${t.toFixed(2)} 秒`;
    renderAngles(angleTable, config, ref ? frameAt(ref, t) : null);
    drawCrop(crop, video, config, ref ? frameAt(ref, t) : null);
  };

  video.addEventListener('seeked', drawCurrent);
  video.addEventListener('timeupdate', drawCurrent);
  video.addEventListener('loadeddata', drawCurrent);
  video.addEventListener('error', () => {
    status.className = 'tool-status warn';
    status.textContent = `⚠ 找不到或無法播放影片 assets/reference/${reference.video}，請確認檔案存在、檔名與 routine.json 一致。`;
  });
  const step = (d: number) => {
    video.pause();
    video.currentTime = Math.max(0, video.currentTime + d / reference.fps);
  };
  prevButton.addEventListener('click', () => step(-1));
  nextButton.addEventListener('click', () => step(1));
  copyButton.addEventListener('click', () => void navigator.clipboard.writeText(video.currentTime.toFixed(2)));
  stepsBox.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).dataset['time'];
    if (t) {
      video.pause();
      video.currentTime = Number(t);
      video.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  extractButton.addEventListener('click', async () => {
    extractButton.disabled = true;
    try {
      const file = await extractAll(video, config, (done, total) => {
        progress.textContent = `擷取中… ${done} / ${total} 幀（${Math.round((done / total) * 100)}%）`;
      });
      progress.textContent = '存檔中…';
      const res = await fetch('/__dev/save-generated?file=reference-poses.json', { method: 'POST', body: JSON.stringify(file) });
      if (!res.ok) throw new Error(await res.text());
      progress.textContent = '✅ 已存到 generated/reference-poses.json';
      await refresh(file);
    } catch (err) {
      progress.textContent = `⚠ 擷取失敗：${err instanceof Error ? err.message : String(err)}`;
    } finally {
      extractButton.disabled = false;
    }
  });

  await refresh(await loadReferenceFile());
}

/** 逐幀擷取整支影片示範者範圍內的骨架 */
export async function extractAll(
  video: HTMLVideoElement,
  config: AppConfig,
  onProgress: (done: number, total: number) => void,
): Promise<ReferenceFile> {
  const { reference } = config.routine;
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  }
  video.pause();
  const estimator = await PoseEstimator.create(config.settings.pose);
  const pipeline = new PosePipeline(estimator, config.settings.pose);

  const sx = Math.round(video.videoWidth * reference.area[0]);
  const width = Math.round(video.videoWidth * reference.area[1]) - sx;
  const height = video.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  const total = Math.floor(video.duration * reference.fps) + 1;
  const frames: (number[] | null)[] = [];
  const base = performance.now();
  for (let i = 0; i < total; i++) {
    video.currentTime = Math.min(i / reference.fps + 0.001, video.duration);
    await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
    ctx.drawImage(video, sx, 0, width, height, 0, 0, width, height);
    const frame = pipeline.process(canvas, width, height, base + (i * 1000) / reference.fps);
    frames.push(frame ? encodeFrame(frame) : null);
    if (i % 10 === 0) onProgress(i, total);
  }
  estimator.close();
  onProgress(total, total);
  return { version: 1, video: reference.video, area: reference.area, fps: reference.fps, model: config.settings.pose.model, width, height, frames };
}

function drawCrop(canvas: HTMLCanvasElement, video: HTMLVideoElement, config: AppConfig, frame: ReturnType<typeof frameAt>): void {
  const [a0, a1] = config.routine.reference.area;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw) return;
  const sx = Math.round(vw * a0);
  const w = Math.round(vw * a1) - sx;
  canvas.width = w;
  canvas.height = vh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, sx, 0, w, vh, 0, 0, w, vh);
  if (!frame) return;
  ctx.save();
  // 鏡像模式下骨架已左右翻轉成「練習者」的版本，畫的時候再翻回來才會疊在示範者身上
  if (config.settings.display.mirrorMode === 'mirror') {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  drawSkeleton(ctx, frame, { color: '#4fc3f7', lineWidth: vh * 0.012, minVisibility: config.settings.judge.minVisibility });
  ctx.restore();
}

function renderAngles(table: HTMLTableElement, config: AppConfig, frame: ReturnType<typeof frameAt>): void {
  const rows = Object.entries(config.angles).map(([id, def]) => {
    const v = frame ? angleValue(def, frame, config.settings.judge.minVisibility) : null;
    return el('tr', {}, el('td', {}, def.name), el('td', { class: 'mono' }, id), el('td', { class: 'num' }, v === null ? '—' : `${v.toFixed(0)}°`));
  });
  table.replaceChildren(el('tbody', {}, ...rows));
}

function renderSteps(box: HTMLElement, config: AppConfig, ref: ReferenceData | null): void {
  if (!ref) {
    box.replaceChildren(el('p', { class: 'muted' }, '擷取骨架後才能計算目標角度。'));
    return;
  }
  const { targets, errors } = computeTargets(ref, config.routine.steps, config.settings.judge.minVisibility);
  box.replaceChildren(
    ...errors.map((e) => el('p', { class: 'error-banner' }, `⚠ ${e}`)),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, el('th', {}, '步驟'), el('th', {}, '檢查點'), el('th', {}, '時間'), el('th', {}, '目標角度'))),
      el(
        'tbody',
        {},
        ...targets.flatMap((st, si) => {
          const step = config.routine.steps[si]!;
          return st.checkpoints.map((cp, ci) =>
            el(
              'tr',
              {},
              el('td', {}, ci === 0 ? `${si + 1}. ${step.name}` : ''),
              el('td', {}, cp.name),
              el('td', {}, el('button', { class: 'link', 'data-time': String(cp.time) }, `${cp.time} 秒 ▶`)),
              el(
                'td',
                {},
                step.angles.map((a) => `${a.def.name} ${cp.angles[a.id] === undefined ? '—' : `${cp.angles[a.id]!.toFixed(0)}°`}`).join('、'),
              ),
            ),
          );
        }),
      ),
    ),
  );
}

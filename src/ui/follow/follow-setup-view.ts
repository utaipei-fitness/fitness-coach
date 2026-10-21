// 自選影片跟練：選好影片後，選示範者在畫面哪一側 → 分析動作 → 存進「我的影片」。
import type { AppConfig } from '../../config/load';
import { extractPoses } from '../../reference/extract';
import { newVideoId, saveVideo, type SavedVideo } from '../../storage/video-library';
import { el } from '../dom';
import './follow.css';

export interface FollowSetupActions {
  /** 分析完成後按「開始跟練」（在點擊當下呼叫，才能播放影片聲音） */
  onStart(saved: SavedVideo): void;
  onCancel(): void;
}

const AREAS: { label: string; area: [number, number] }[] = [
  { label: '整個畫面', area: [0, 1] },
  { label: '左半邊', area: [0, 0.5] },
  { label: '右半邊', area: [0.5, 1] },
];

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} 分 ${Math.round(s % 60)} 秒` : `${Math.round(s)} 秒`;
}

export function renderFollowSetup(root: HTMLElement, config: AppConfig, file: File, actions: FollowSetupActions): void {
  const url = URL.createObjectURL(file);
  const video = el('video', { class: 'fs-video', src: url, muted: '', playsinline: '', controls: '', preload: 'auto' });
  video.muted = true;
  const shadeLeft = el('div', { class: 'fs-shade left' });
  const shadeRight = el('div', { class: 'fs-shade right' });
  const preview = el('div', { class: 'fs-preview' }, video, shadeLeft, shadeRight);
  // 預覽框的大小貼齊影片畫面（沒有黑邊），灰色遮罩才會蓋在正確的位置
  video.addEventListener('loadedmetadata', () => {
    const aspect = video.videoWidth / video.videoHeight || 16 / 9;
    preview.style.width = `min(100%, 720px, ${(55 * aspect).toFixed(1)}vh)`;
  });

  const nameInput = el('input', { class: 'fs-name', type: 'text', maxlength: '40' });
  nameInput.value = file.name.replace(/\.[^.]+$/, '');
  let area: [number, number] = AREAS[0]!.area;
  const areaButtons = AREAS.map((a) => {
    const b = el('button', { class: 'voice-option' }, a.label);
    b.addEventListener('click', () => {
      area = a.area;
      showArea();
    });
    return b;
  });
  const showArea = () => {
    areaButtons.forEach((b, i) => b.classList.toggle('active', AREAS[i]!.area === area));
    shadeLeft.style.width = `${area[0] * 100}%`;
    shadeRight.style.width = `${(1 - area[1]) * 100}%`;
  };
  showArea();

  const analyzeButton = el('button', { class: 'primary big' }, '🔍 開始分析動作');
  const cancelButton = el('button', {}, '取消');
  const bar = el('div', { class: 'fs-bar' }, el('div', { class: 'fs-bar-fill' }));
  const status = el('p', { class: 'muted' }, '');
  const progressBox = el('div', { class: 'fs-progress', hidden: '' }, bar, status);
  const resultBox = el('div', { class: 'fs-result', hidden: '' });

  let aborter: AbortController | null = null;
  const leave = () => {
    aborter?.abort();
    URL.revokeObjectURL(url);
    actions.onCancel();
  };
  cancelButton.addEventListener('click', leave);

  analyzeButton.addEventListener('click', async () => {
    analyzeButton.disabled = true;
    areaButtons.forEach((b) => (b.disabled = true));
    progressBox.hidden = false;
    aborter = new AbortController();
    const started = performance.now();
    try {
      const analysis = await extractPoses(video, {
        pose: config.settings.pose,
        area,
        fps: config.settings.follow.fps,
        videoName: nameInput.value.trim() || file.name,
        signal: aborter.signal,
        onProgress: (done, total) => {
          const ratio = done / total;
          (bar.firstChild as HTMLElement).style.width = `${ratio * 100}%`;
          const elapsed = (performance.now() - started) / 1000;
          const left = ratio > 0.03 ? (elapsed / ratio) * (1 - ratio) : null;
          status.textContent = `分析中… ${Math.round(ratio * 100)}%${left !== null ? `（約剩 ${formatSec(left)}）` : ''}　影片只在這台裝置上分析，不會上傳`;
        },
      });
      const found = analysis.frames.filter(Boolean).length / Math.max(analysis.frames.length, 1);
      const saved: SavedVideo = {
        id: newVideoId(),
        name: nameInput.value.trim() || file.name,
        createdAt: new Date().toISOString(),
        durationSec: video.duration,
        analysis,
        video: file,
        fileSize: file.size,
      };
      const videoStored = await saveVideo(saved);
      progressBox.hidden = true;
      const start = el('button', { class: 'primary big' }, '▶ 開始跟練');
      const home = el('button', {}, '回首頁');
      home.addEventListener('click', leave);
      start.addEventListener('click', () => {
        URL.revokeObjectURL(url);
        actions.onStart(saved);
      });
      resultBox.replaceChildren(
        el('h2', {}, '✅ 分析完成'),
        el('p', {}, `影片長度 ${formatSec(video.duration)}，${Math.round(found * 100)}% 的畫面偵測到示範者。已存進「我的影片」，下次可以直接練。`),
        ...(found < 0.5
          ? [el('p', { class: 'error-banner' }, '⚠ 很多畫面沒有偵測到人：可能是示範者太小、被擋住，或選錯了左右範圍。比對結果可能不準。')]
          : []),
        ...(videoStored ? [] : [el('p', { class: 'error-banner' }, '⚠ 這台裝置空間不夠存下影片本身，只存了分析結果；下次練習時需要重新選這支影片。')]),
        el('div', { class: 'actions' }, start, home),
      );
      resultBox.hidden = false;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      status.textContent = `⚠ 分析失敗：${err instanceof Error ? err.message : String(err)}`;
      analyzeButton.disabled = false;
      areaButtons.forEach((b) => (b.disabled = false));
    }
  });

  root.replaceChildren(
    el(
      'main',
      { class: 'follow-setup' },
      el('h1', {}, '📼 分析新影片'),
      el('p', { class: 'muted' }, '系統會分析影片中示範者的動作，之後你跟著影片做，系統邊播邊比對。影片只在這台裝置上處理，不會上傳。'),
      preview,
      el('label', { class: 'fs-row' }, el('span', {}, '影片名稱'), nameInput),
      el(
        'div',
        { class: 'fs-row' },
        el('span', {}, '示範者在'),
        el('span', { class: 'voice-options' }, ...areaButtons),
      ),
      el('p', { class: 'muted' }, '影片裡有好幾個人時，選示範者所在的那一半（灰色部分不會分析）。'),
      el('div', { class: 'actions' }, analyzeButton, cancelButton),
      progressBox,
      resultBox,
    ),
  );
}

// 首頁：開啟鏡頭／選擇影片檔，下方顯示設定檔摘要。
// （階段 4 會加入個人資料輸入與「開始練習」）
import type { AppConfig } from '../config/load';
import { configSummary } from './config-summary';
import { el } from './dom';

export interface HomeActions {
  onCamera(): Promise<void>;
  onVideoFile(file: File): Promise<void>;
}

export function renderHome(root: HTMLElement, config: AppConfig, actions: HomeActions, error?: string): void {
  const cameraButton = el('button', { class: 'primary' }, '📷 開啟鏡頭');
  const fileButton = el('button', {}, '🎞 選擇影片檔');
  const fileInput = el('input', { type: 'file', accept: 'video/*', hidden: '' });
  const status = el('p', { class: error ? 'error-banner' : 'muted' }, error ? `⚠ ${error}` : '開啟鏡頭後，請站在 2～3 公尺外、讓全身入鏡。也可以選一支影片檔代替鏡頭。');

  const busy = (text: string) => {
    cameraButton.disabled = true;
    fileButton.disabled = true;
    status.className = 'muted';
    status.textContent = text;
  };

  cameraButton.addEventListener('click', () => {
    busy('開啟鏡頭中…（瀏覽器詢問時請按「允許」）');
    void actions.onCamera();
  });
  fileButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    busy(`載入影片「${file.name}」中…`);
    void actions.onVideoFile(file);
  });

  root.replaceChildren(
    el(
      'main',
      {},
      el('h1', {}, '即時健身操動作比對系統'),
      el('div', { class: 'actions' }, cameraButton, fileButton, fileInput),
      status,
      configSummary(config),
    ),
  );
}

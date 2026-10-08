// 網頁進入點：先載入並檢查設定檔，有錯就顯示中文錯誤清單，沒錯才進入首頁。
import './style.css';
import { loadBundledConfig } from './config/bundled';
import type { AppConfig } from './config/load';
import { openCamera, openVideoFile, type VideoSource } from './input/video-source';
import { renderConfigErrors } from './ui/config-error-view';
import { renderHome } from './ui/home-view';
import { showLiveView } from './ui/live-view';

const root = document.querySelector<HTMLElement>('#app')!;
const result = loadBundledConfig();

if (!result.ok) {
  renderConfigErrors(root, result.errors);
} else {
  goHome(result.config);
}

function goHome(config: AppConfig, error?: string): void {
  const start = async (open: () => Promise<VideoSource>) => {
    try {
      const source = await open();
      showLiveView(root, config, source, () => goHome(config));
    } catch (err) {
      goHome(config, err instanceof Error ? err.message : String(err));
    }
  };
  renderHome(
    root,
    config,
    {
      onCamera: () => start(() => openCamera(config.settings.camera)),
      onVideoFile: (file) => start(() => openVideoFile(file)),
    },
    error,
  );
}

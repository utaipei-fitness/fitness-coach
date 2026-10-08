// 網頁進入點：先載入並檢查設定檔，有錯就顯示中文錯誤清單，沒錯才進入主畫面。
import './style.css';
import { loadBundledConfig } from './config/bundled';
import { renderConfigErrors } from './ui/config-error-view';
import { renderConfigSummary } from './ui/config-summary-view';

const root = document.querySelector<HTMLElement>('#app')!;
const result = loadBundledConfig();

if (!result.ok) {
  renderConfigErrors(root, result.errors);
} else {
  renderConfigSummary(root, result.config);
}

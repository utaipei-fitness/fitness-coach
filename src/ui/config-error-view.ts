// 設定檔有錯時顯示的全畫面錯誤清單（取代白屏）。
import type { ConfigError } from '../config/load';
import { el } from './dom';

export function renderConfigErrors(root: HTMLElement, errors: ConfigError[]): void {
  root.replaceChildren(
    el(
      'main',
      { class: 'config-errors' },
      el('h1', {}, `⚠ 設定檔有 ${errors.length} 個錯誤`),
      el('p', { class: 'muted' }, '請依照下面的說明修改 config/ 資料夾中的檔案，存檔後網頁會自動重新載入。'),
      el(
        'ol',
        {},
        ...errors.map((e) =>
          el(
            'li',
            { class: 'error-card' },
            el('div', { class: 'error-loc' }, `📄 config/${e.file}`, e.where ? ` ・ ${e.where}` : ''),
            e.field ? el('div', { class: 'error-field' }, `欄位：${e.field}`) : null,
            el('div', { class: 'error-msg' }, e.message),
          ),
        ),
      ),
      el('p', { class: 'muted' }, '看不懂怎麼改？把這個畫面上的錯誤訊息複製貼給 Claude Code 即可。'),
    ),
  );
}

// 設定檔載入成功時的摘要畫面：列出目前的步驟與主要設定，方便確認改動有沒有生效。
// （階段 0 的首頁；之後會變成練習前的「確認設定」頁）
import type { AppConfig, ResolvedStep } from '../config/load';
import { el } from './dom';

const MIRROR_TEXT = {
  mirror: '照畫面跟做（示範者的右手 ↔ 你的左手）',
  sameSide: '依口令同側（示範者的右手 ↔ 你的右手）',
} as const;

function conditionText(step: ResolvedStep): string {
  if (step.type === 'static') return `維持 ${step.holdMs / 1000} 秒（影片 ${step.time} 秒處）`;
  const cps = step.checkpoints.map((c) => `${c.name}（${c.time} 秒）`).join(' → ');
  return `做 ${step.reps} 次：${cps}`;
}

export function renderConfigSummary(root: HTMLElement, config: AppConfig): void {
  const { routine, settings } = config;
  root.replaceChildren(
    el(
      'main',
      { class: 'summary' },
      el('h1', {}, '即時健身操動作比對系統'),
      el('p', { class: 'ok' }, '✅ 設定檔載入成功'),
      el('h2', {}, `${routine.name}（共 ${routine.steps.length} 步）`),
      el(
        'table',
        {},
        el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, '名稱'), el('th', {}, '類型'), el('th', {}, '通過條件'), el('th', {}, '檢查角度'))),
        el(
          'tbody',
          {},
          ...routine.steps.map((s, i) =>
            el(
              'tr',
              {},
              el('td', {}, String(i + 1)),
              el('td', {}, s.name),
              el('td', {}, s.type === 'static' ? '靜態' : '動態'),
              el('td', {}, conditionText(s)),
              el('td', {}, s.angles.map((a) => `${a.def.name} ±${a.tolerance}°`).join('、')),
            ),
          ),
        ),
      ),
      el('h2', {}, '主要設定'),
      el(
        'ul',
        {},
        el('li', {}, `左右對應：${MIRROR_TEXT[settings.display.mirrorMode]}`),
        el('li', {}, `每步逾時：${settings.giveUp.timeoutSec} 秒，或嘗試 ${settings.giveUp.maxAttempts} 次`),
        el('li', {}, `姿態模型：${settings.pose.model}（${settings.pose.useGpu ? '優先 GPU' : '只用 CPU'}）`),
        el('li', {}, `熱量估算 MET：${settings.energy.met}`),
      ),
      el('p', { class: 'muted' }, '目前是階段 0：只有設定檔檢查。下一階段加入鏡頭與骨架。'),
    ),
  );
}

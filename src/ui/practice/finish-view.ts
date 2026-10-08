// 練習結束畫面（簡易版；階段 5 會加入熱量估算與歷史紀錄）
import type { AppConfig } from '../../config/load';
import type { Session, StepResult } from '../../engine/step-engine';
import { el } from '../dom';

/** 這一步最常偏差的角度：最常是「最需要修正那一項」的角度，並附上平均超出幾度 */
function worstAngle(r: StepResult, config: AppConfig): string {
  let bestId = '';
  let best = 0;
  for (const [id, d] of Object.entries(r.deviations)) {
    if (d.worstFrames > best) {
      best = d.worstFrames;
      bestId = id;
    }
  }
  if (!bestId) return '—';
  const d = r.deviations[bestId]!;
  return `${config.angles[bestId]?.name ?? bestId}（平均超出 ${Math.round(d.sumWorstExcess / d.worstFrames)}°）`;
}

export function renderFinish(root: HTMLElement, config: AppConfig, session: Session, actions: { again(): void; home(): void }): void {
  const results = session.results;
  const passed = results.filter((r) => r.outcome === 'passed').length;
  const totalSec = ((session.endT ?? performance.now()) - session.startT) / 1000;
  const again = el('button', { class: 'primary' }, '↻ 再練一次');
  const home = el('button', {}, '回首頁');
  again.addEventListener('click', actions.again);
  home.addEventListener('click', actions.home);

  root.replaceChildren(
    el(
      'main',
      { class: 'finish' },
      el('h1', {}, '🎉 練習完成！'),
      el(
        'div',
        { class: 'finish-stats' },
        el('div', {}, el('b', {}, `${Math.round((passed / results.length) * 100)}%`), el('span', {}, '達標率')),
        el('div', {}, el('b', {}, `${passed}/${results.length}`), el('span', {}, '通過步驟')),
        el('div', {}, el('b', {}, `${Math.floor(totalSec / 60)}:${String(Math.round(totalSec % 60)).padStart(2, '0')}`), el('span', {}, '總時間')),
      ),
      el(
        'table',
        {},
        el('thead', {}, el('tr', {}, el('th', {}, '步驟'), el('th', {}, '結果'), el('th', {}, '嘗試'), el('th', {}, '耗時'), el('th', {}, '最常偏差'))),
        el(
          'tbody',
          {},
          ...results.map((r) =>
            el(
              'tr',
              {},
              el('td', {}, r.name),
              el('td', {}, r.outcome === 'passed' ? (r.relaxed ? '✓ 通過（已放寬）' : '✓ 通過') : '⏭ 跳過'),
              el('td', {}, `${r.attempts} 次`),
              el('td', {}, `${(r.durationMs / 1000).toFixed(0)} 秒`),
              el('td', {}, worstAngle(r, config)),
            ),
          ),
        ),
      ),
      el('p', { class: 'muted' }, '完整報告（熱量估算、歷史紀錄）將在階段 5 加入。'),
      el('div', { class: 'actions' }, again, home),
    ),
  );
}

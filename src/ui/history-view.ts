// 練習紀錄頁：數字卡片（次數、連續天數、最近 7 天、最佳分數）、整套練習分數的折線圖、各動作的進步、最近紀錄。
import { clearHistory, countLastDays, loadHistory, stepTrends, streakDays, type HistoryRecord } from '../storage/history';
import { el } from './dom';

const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 整套練習分數的折線圖（單一數列，滑鼠移到點上顯示日期與分數） */
function scoreChart(records: HistoryRecord[]): HTMLElement {
  const pts = records.filter((r) => r.mode === 'full' && r.score !== null).slice(-20);
  if (pts.length < 2) return el('p', { class: 'muted' }, '完成兩次以上的整套練習後，這裡會出現分數變化圖。');

  const W = 640;
  const H = 220;
  const pad = { l: 36, r: 16, t: 14, b: 26 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (pts.length - 1);
  const y = (v: number) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100;

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hist-chart', role: 'img', 'aria-label': '整套練習分數變化' });
  for (const v of [0, 50, 100]) {
    chart.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'hist-grid' }));
    const label = svg('text', { x: pad.l - 8, y: y(v) + 4, class: 'hist-axis', 'text-anchor': 'end' });
    label.textContent = String(v);
    chart.append(label);
  }
  const first = svg('text', { x: x(0), y: H - 6, class: 'hist-axis', 'text-anchor': 'start' });
  first.textContent = formatDate(pts[0]!.at).split(' ')[0]!;
  const last = svg('text', { x: x(pts.length - 1), y: H - 6, class: 'hist-axis', 'text-anchor': 'end' });
  last.textContent = formatDate(pts.at(-1)!.at).split(' ')[0]!;
  chart.append(first, last);
  chart.append(svg('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.score!)}`).join(' '), class: 'hist-line' }));

  const tip = el('div', { class: 'hist-tip', hidden: '' });
  pts.forEach((p, i) => {
    const dot = svg('circle', { cx: x(i), cy: y(p.score!), r: 5, class: 'hist-dot' });
    // 比點大的感應範圍，比較好指到
    const hit = svg('circle', { cx: x(i), cy: y(p.score!), r: 14, class: 'hist-hit', tabindex: 0 });
    const show = () => {
      tip.textContent = `${formatDate(p.at)}　${p.score} 分`;
      tip.style.left = `${(x(i) / W) * 100}%`;
      tip.style.top = `${(y(p.score!) / H) * 100}%`;
      tip.hidden = false;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', () => (tip.hidden = true));
    hit.addEventListener('blur', () => (tip.hidden = true));
    chart.append(dot, hit);
  });
  // 最後一點直接標數字
  const lastLabel = svg('text', { x: x(pts.length - 1), y: y(pts.at(-1)!.score!) - 12, class: 'hist-last', 'text-anchor': 'end' });
  lastLabel.textContent = `${pts.at(-1)!.score} 分`;
  chart.append(lastLabel);

  return el('div', { class: 'hist-chart-wrap' }, chart, tip);
}

export function renderHistory(root: HTMLElement, variant: string, variantName: string, onBack: () => void): void {
  const records = loadHistory();
  const mine = records.filter((r) => r.variant === variant);
  const today = new Date();
  const fullScores = mine.filter((r) => r.mode === 'full' && r.score !== null).map((r) => r.score!);
  const back = el('button', {}, '← 回首頁');
  back.addEventListener('click', onBack);
  const clear = el('button', { class: 'hist-clear' }, '清除全部紀錄');
  clear.addEventListener('click', () => {
    if (window.confirm('確定要清除這台裝置上的全部練習紀錄嗎？清除後無法復原。')) {
      clearHistory();
      renderHistory(root, variant, variantName, onBack);
    }
  });

  const trends = stepTrends(records, variant);
  root.replaceChildren(
    el(
      'main',
      { class: 'history' },
      el('div', { class: 'actions' }, back),
      el('h1', {}, `📈 練習紀錄（${variantName}）`),
      el('p', { class: 'muted' }, '紀錄只存在這台裝置的瀏覽器裡，不會上傳。'),
      el(
        'div',
        { class: 'finish-stats hist-stats' },
        el('div', {}, el('b', {}, String(mine.length)), el('span', {}, '練習次數')),
        el('div', {}, el('b', {}, `${streakDays(records, today)}`), el('span', {}, '連續天數')),
        el('div', {}, el('b', {}, `${countLastDays(mine, today)}`), el('span', {}, '最近 7 天')),
        el('div', {}, el('b', {}, fullScores.length ? String(Math.max(...fullScores)) : '—'), el('span', {}, '最佳分數')),
      ),
      el('section', { class: 'finish-block' }, el('h2', {}, '整套練習分數'), scoreChart(mine)),
      el(
        'section',
        { class: 'finish-block' },
        el('h2', {}, '各動作精確度'),
        trends.length
          ? el(
              'div',
              { class: 'table-scroll' },
              el(
                'table',
                {},
                el('thead', {}, el('tr', {}, el('th', {}, '動作'), el('th', {}, '最近一次'), el('th', {}, '最近 3 次平均'), el('th', {}, '和之前比'))),
                el(
                  'tbody',
                  {},
                  ...trends.map((t) =>
                    el(
                      'tr',
                      {},
                      el('td', {}, t.name),
                      el('td', {}, t.latest === null ? '—' : String(t.latest)),
                      el('td', {}, t.recentAvg === null ? '—' : String(t.recentAvg)),
                      el(
                        'td',
                        {},
                        t.change === null
                          ? el('span', { class: 'muted' }, '資料不足')
                          : el('b', { class: t.change > 0 ? 'score-high' : t.change < 0 ? 'score-low' : '' }, `${t.change > 0 ? '▲ +' : t.change < 0 ? '▼ ' : ''}${t.change}`),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : el('p', { class: 'muted' }, '還沒有紀錄。'),
      ),
      el(
        'section',
        { class: 'finish-block' },
        el('h2', {}, '最近的練習'),
        mine.length
          ? el(
              'ul',
              { class: 'hist-list' },
              ...mine
                .slice(-10)
                .reverse()
                .map((r) =>
                  el(
                    'li',
                    {},
                    `${formatDate(r.at)}　${r.mode === 'full' ? '整套' : `單獨：${r.steps[0]?.name ?? ''}`}　`,
                    el('b', {}, r.score === null ? '—' : `${r.score} 分`),
                    `　${Math.round(r.durationSec / 60)} 分鐘`,
                  ),
                ),
            )
          : el('p', { class: 'muted' }, '還沒有紀錄。'),
      ),
      el('div', { class: 'actions' }, clear),
    ),
  );
}

// 自選影片跟練的成績：總分、每一段的分數、最需要加強的部位。
import type { FollowSummary } from '../../follow/follow-scorer';
import { scoreComment } from '../../report/score';
import { el } from '../dom';
import { ProgressRing } from '../practice/ring';
import './follow.css';

export interface FollowFinishActions {
  /** 再練一次（在點擊當下呼叫，才能播放影片聲音） */
  again(): void;
  home(): void;
}

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function level(n: number): string {
  return n >= 85 ? 'score-high' : n >= 65 ? 'score-mid' : 'score-low';
}

export function renderFollowFinish(root: HTMLElement, name: string, summary: FollowSummary, actions: FollowFinishActions): void {
  const again = el('button', { class: 'primary' }, '↻ 再跟練一次');
  const home = el('button', {}, '回首頁');
  again.addEventListener('click', actions.again);
  home.addEventListener('click', actions.home);

  const ring = new ProgressRing();
  ring.set((summary.score ?? 0) / 100, summary.score === null ? '—' : String(summary.score), summary.score === null ? '' : '分');
  ring.element.classList.add('finish-ring');

  const parts = summary.parts.filter((p) => p.worstCount > 0).slice(0, 3);
  root.replaceChildren(
    el(
      'main',
      { class: 'finish follow-finish' },
      el('h1', {}, `🎉「${name}」跟練完成！`),
      el(
        'section',
        { class: 'finish-score' },
        ring.element,
        el(
          'div',
          {},
          el('p', { class: 'finish-comment' }, summary.score === null ? '這次幾乎都沒看到人，沒辦法計分 🙂' : scoreComment(summary.score)),
          summary.coverage < 0.6 && summary.score !== null
            ? el('p', { class: 'muted' }, `只有 ${Math.round(summary.coverage * 100)}% 的時間看得到你，分數僅供參考。下次請讓全身入鏡。`)
            : el('p', { class: 'muted' }, '分數＝每一刻和示範動作的接近程度（慢半拍不扣分）。'),
        ),
      ),
      el('h2', {}, '每一段的表現'),
      el(
        'ol',
        { class: 'ff-segments' },
        ...summary.segments.map((s) =>
          el(
            'li',
            {},
            el('span', { class: 'ff-seg-time' }, `${fmt(s.start)}–${fmt(s.end)}`),
            el('span', { class: 'ff-seg-bar' }, el('span', { class: `ff-seg-fill ${s.score === null ? '' : level(s.score)}`, style: `width:${s.score ?? 0}%` })),
            el('b', { class: s.score === null ? 'muted' : level(s.score) }, s.score === null ? '沒入鏡' : `${s.score}`),
          ),
        ),
      ),
      parts.length
        ? el(
            'div',
            {},
            el('h2', {}, '最需要加強的部位'),
            el('ul', { class: 'ff-parts' }, ...parts.map((p) => el('li', {}, el('b', {}, p.name), `　平均差 ${p.avgDiff}°`))),
          )
        : el('p', {}, '各部位都跟得不錯 👍'),
      el('div', { class: 'actions' }, again, home),
    ),
  );
}

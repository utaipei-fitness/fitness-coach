// 練習結束畫面：總分（完整度＋精確度）、每一步的得分與結果。
// （階段 5 會再加入熱量估算與歷史紀錄）
import type { AppConfig } from '../../config/load';
import type { Session, StepResult } from '../../engine/step-engine';
import { getMusic } from '../../feedback/music';
import { primeSpeech } from '../../feedback/voice';
import { scoreComment, scoreSession } from '../../report/score';
import { el } from '../dom';
import { ProgressRing } from './ring';

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

/** 判斷某一步是不是「跟做」（跟做沒有精確度） */
function followChecker(config: AppConfig) {
  return (r: StepResult) => config.routine.steps.find((s) => s.id === r.stepId)?.type === 'follow';
}

function scoreClass(n: number): string {
  return n >= 85 ? 'score-high' : n >= 65 ? 'score-mid' : 'score-low';
}

export function renderFinish(root: HTMLElement, config: AppConfig, session: Session, actions: { again(): void; home(): void }): void {
  const results = session.results;
  const isFollow = followChecker(config);
  const score = scoreSession(results, config.settings.scoring);
  const passed = results.filter((r) => r.outcome === 'passed').length;
  const totalSec = ((session.endT ?? performance.now()) - session.startT) / 1000;
  const single = results.length === 1;
  const again = el('button', { class: 'primary' }, single ? '↻ 再練一次這個動作' : '↻ 再練一次');
  const home = el('button', {}, '回首頁');
  again.addEventListener('click', () => {
    primeSpeech();
    getMusic()?.start();
    actions.again();
  });
  home.addEventListener('click', actions.home);

  const ring = new ProgressRing();
  ring.set(score.total / 100, String(score.total), '分');
  ring.element.classList.add('finish-ring');

  root.replaceChildren(
    el(
      'main',
      { class: 'finish' },
      el('h1', {}, single ? `🎉「${results[0]!.name}」練習完成！` : '🎉 全部練習完成！'),
      el(
        'section',
        { class: 'finish-score' },
        ring.element,
        el(
          'div',
          {},
          el('p', { class: 'finish-comment' }, scoreComment(score.total)),
          el(
            'div',
            { class: 'finish-stats' },
            el('div', {}, el('b', {}, `${score.completion}`), el('span', {}, '完整度')),
            el('div', {}, el('b', {}, score.accuracy === null ? '—' : `${score.accuracy}`), el('span', {}, '精確度')),
            el('div', {}, el('b', {}, `${passed}/${results.length}`), el('span', {}, '通過動作')),
            el('div', {}, el('b', {}, `${Math.floor(totalSec / 60)}:${String(Math.round(totalSec % 60)).padStart(2, '0')}`), el('span', {}, '總時間')),
          ),
          el('p', { class: 'muted' }, '完整度＝動作做完多少；精確度＝角度和標準動作的接近程度（「跟做」的動作不算精確度）。'),
        ),
      ),
      el(
        'div',
        { class: 'table-scroll' },
        el(
          'table',
          {},
          el(
            'thead',
            {},
            el('tr', {}, el('th', {}, '動作'), el('th', {}, '得分'), el('th', {}, '完整度'), el('th', {}, '精確度'), el('th', {}, '結果'), el('th', {}, '最常偏差')),
          ),
          el(
            'tbody',
            {},
            ...results.map((r, i) => {
              const s = score.steps[i]!;
              return el(
                'tr',
                {},
                el('td', {}, r.name),
                el('td', {}, el('b', { class: scoreClass(s.total) }, `${s.total}`)),
                el('td', {}, `${s.completion}`),
                el('td', {}, s.accuracy !== null ? `${s.accuracy}` : isFollow(r) ? '—（跟做）' : '—'),
                el('td', {}, r.outcome === 'passed' ? (r.relaxed ? '✓ 通過（已放寬）' : '✓ 通過') : '⏭ 跳過'),
                el('td', {}, worstAngle(r, config)),
              );
            }),
          ),
        ),
      ),
      el('p', { class: 'muted' }, '熱量估算與歷史紀錄將在之後加入。'),
      el('div', { class: 'actions' }, again, home),
    ),
  );
}

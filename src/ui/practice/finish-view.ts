// 練習結束畫面（極簡）：整體精確度分數＋重點報告（哪些動作未完成、哪些需要修正）。
import type { AppConfig } from '../../config/load';
import type { Session } from '../../engine/step-engine';
import { getMusic } from '../../feedback/music';
import { primeSpeech } from '../../feedback/voice';
import { buildReport, scoreComment } from '../../report/score';
import { el } from '../dom';
import { ProgressRing } from './ring';

export interface FinishActions {
  /** 和上一次整套練習比的分數差（單獨練習或沒有上一次時為 null） */
  change: number | null;
  again(): void;
  home(): void;
  history(): void;
}

export function renderFinish(root: HTMLElement, config: AppConfig, session: Session, actions: FinishActions): void {
  const results = session.results;
  const report = buildReport(results, config.settings.scoring);
  const single = results.length === 1;
  const again = el('button', { class: 'primary' }, single ? '↻ 再練一次這個動作' : '↻ 再練一次');
  const home = el('button', {}, '回首頁');
  again.addEventListener('click', () => {
    primeSpeech();
    getMusic()?.start();
    actions.again();
  });
  home.addEventListener('click', actions.home);
  const history = el('button', {}, '📈 練習紀錄');
  history.addEventListener('click', actions.history);

  const ring = new ProgressRing();
  ring.set((report.score ?? 0) / 100, report.score === null ? '—' : String(report.score), report.score === null ? '' : '分');
  ring.element.classList.add('finish-ring');

  const angleName = (id: string | null) => (id ? (config.angles[id]?.name ?? id) : '');
  const allGood = report.incomplete.length === 0 && report.needsWork.length === 0;

  root.replaceChildren(
    el(
      'main',
      { class: 'finish' },
      el('h1', {}, single ? `「${results[0]!.name}」練習完成` : '練習完成'),
      el(
        'section',
        { class: 'finish-score' },
        ring.element,
        el(
          'div',
          {},
          el('p', { class: 'finish-label' }, '整體動作精確度'),
          el('p', { class: 'finish-comment' }, report.score === null ? '這次沒有可評分的動作' : scoreComment(report.score)),
          actions.change === null
            ? null
            : el(
                'p',
                { class: `finish-change ${actions.change > 0 ? 'score-high' : actions.change < 0 ? 'score-low' : ''}` },
                actions.change > 0 ? `▲ 比上次進步 ${actions.change} 分` : actions.change < 0 ? `▼ 比上次少 ${-actions.change} 分` : '和上次一樣',
              ),
        ),
      ),
      el(
        'section',
        { class: 'finish-report' },
        allGood ? el('p', { class: 'finish-ok' }, '✓ 全部完成，沒有需要特別修正的動作') : null,
        report.incomplete.length
          ? el('div', { class: 'finish-block' }, el('h2', {}, '未完成'), el('p', {}, report.incomplete.join('、')))
          : null,
        report.needsWork.length
          ? el(
              'div',
              { class: 'finish-block' },
              el('h2', {}, '需要修正'),
              el('ul', {}, ...report.needsWork.map((n) => el('li', {}, el('b', {}, n.name), n.angleId ? `：注意${angleName(n.angleId)}` : ''))),
            )
          : null,
      ),
      el(
        'details',
        { class: 'finish-details' },
        el('summary', {}, '各動作精確度'),
        el(
          'ul',
          {},
          ...results.map((r, i) => {
            const acc = report.steps[i];
            const text = r.outcome === 'skipped' ? '未完成' : acc === null || acc === undefined ? '跟做（不評分）' : `${acc} 分`;
            return el('li', {}, `${r.name}：${text}`);
          }),
        ),
      ),
      el('div', { class: 'actions' }, again, history, home),
    ),
  );
}

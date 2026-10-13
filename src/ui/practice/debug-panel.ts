// 除錯面板：目前步驟、各角度的使用者值／目標／差值／是否達標、FPS、每幀處理時間、左右對應方式。
// 開關狀態記在瀏覽器裡（只影響這台裝置）。
import type { AppConfig } from '../../config/load';
import type { StepView } from '../../engine/step-engine';
import type { VideoSource } from '../../input/video-source';
import { el } from '../dom';
import type { PerfMeter } from '../perf-meter';

const STORAGE_KEY = 'fitness-coach.debug-open';

const MIRROR_TEXT = {
  mirror: '照畫面跟做：示範者的右手 ↔ 你的左手',
  sameSide: '依口令同側：示範者的右手 ↔ 你的右手',
} as const;

export class DebugPanel {
  readonly element = el('aside', { class: 'pr-debug' });

  constructor(
    private readonly config: AppConfig,
    private readonly source: VideoSource,
  ) {
    let open = false;
    try {
      open = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* 無法使用瀏覽器儲存時，預設關閉 */
    }
    this.element.hidden = !open;
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
    try {
      localStorage.setItem(STORAGE_KEY, this.element.hidden ? '0' : '1');
    } catch {
      /* 忽略 */
    }
  }

  update(view: StepView, perf: PerfMeter, stepIndex: number, delegate: string, model: string): void {
    if (this.element.hidden) return;
    const step = view.step;
    const fmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}°`);
    const stepInfo =
      step.type === 'static'
        ? `靜態・已維持 ${(view.heldMs / 1000).toFixed(1)} / ${(step.holdMs / 1000).toFixed(1)} 秒`
        : step.type === 'follow'
          ? `跟做・已做 ${(view.heldMs / 1000).toFixed(1)} / ${step.durationSec} 秒（不判定角度）`
          : `動態・第 ${view.reps}/${step.reps} 次・等待「${step.checkpoints[view.checkpointIndex]?.name}」`;
    this.element.replaceChildren(
      el('h3', {}, '除錯面板'),
      el('div', {}, `步驟 ${stepIndex + 1}：${step.name}（${step.id}）`),
      el('div', {}, stepInfo),
      el('div', {}, `經過 ${(view.elapsedMs / 1000).toFixed(0)} / ${step.timeoutSec} 秒・嘗試 ${view.attempts} 次${view.relaxed ? '・已放寬' : ''}`),
      el(
        'table',
        {},
        el('thead', {}, el('tr', {}, el('th', {}, '角度'), el('th', {}, '你'), el('th', {}, '目標'), el('th', {}, '差'), el('th', {}, '容許'), el('th', {}, ''))),
        el(
          'tbody',
          {},
          ...view.checks.map((c) =>
            el(
              'tr',
              { class: c.value === null ? 'unseen' : c.inRange ? 'in' : 'out' },
              el('td', {}, c.name),
              el('td', {}, fmt(c.value)),
              el('td', {}, fmt(c.target)),
              el('td', {}, c.diff === null ? '—' : `${c.diff > 0 ? '+' : ''}${c.diff.toFixed(0)}°`),
              el('td', {}, `±${c.tolerance}°`),
              el('td', {}, c.value === null ? '看不清' : c.inRange ? '✓' : '✗'),
            ),
          ),
        ),
      ),
      el('div', { class: 'muted' }, `FPS ${perf.fps}・每幀 ${perf.avgMs.toFixed(0)} ms・${delegate}・${model}`),
      el('div', { class: 'muted' }, `左右對應：${MIRROR_TEXT[this.config.settings.display.mirrorMode]}`),
      el('div', { class: 'muted' }, `輸入：${this.source.label}`),
    );
  }
}

// 步驟判定引擎（狀態機）。
// 輸入：每一幀的時間與各角度數值；輸出：目前狀態（給畫面顯示）與每一步的結果（給報告）。
// 這個檔案不碰畫面、不碰 MediaPipe，所以可以用測試完整驗證。
import { angleDiff } from '../angles/compute';
import type { ResolvedStep } from '../config/load';
import type { Settings } from '../config/schema';
import type { StepTargets } from '../reference/reference-data';

/** 每一幀的輸入：角度代號 → 角度（看不清楚為 null） */
export type AngleReadings = Record<string, number | null>;

export interface EngineOptions {
  hysteresisDeg: number;
  repTimeoutSec: number;
  /** 靜態：超出範圍不到這麼久（毫秒）不算中斷，維持計時保留 */
  holdGraceMs: number;
  /** 動態：每個角度在這段時間（毫秒）內各自到位過，就算通過這個檢查點（不必同一幀同時到位） */
  checkpointWindowMs: number;
}

/** 從 settings.json 的 judge 取出引擎需要的參數 */
export function engineOptions(judge: Settings['judge']): EngineOptions {
  return {
    hysteresisDeg: judge.hysteresisDeg,
    repTimeoutSec: judge.repTimeoutSec,
    holdGraceMs: judge.holdGraceMs,
    checkpointWindowMs: judge.checkpointWindowMs,
  };
}

export interface AngleCheck {
  id: string;
  name: string;
  /** 使用者目前角度；看不清楚為 null */
  value: number | null;
  target: number;
  /** 使用者 − 目標；看不清楚為 null */
  diff: number | null;
  /** 目前使用的容許角度（含放寬） */
  tolerance: number;
  inRange: boolean;
  hintLow?: string;
  hintHigh?: string;
}

export interface StepView {
  step: ResolvedStep;
  /** 和目前目標（靜態的姿勢／動態的下一個檢查點）比較的結果 */
  checks: AngleCheck[];
  /** 所有要檢查的角度都看得清楚 */
  visible: boolean;
  allInRange: boolean;
  /** 靜態：已維持的毫秒數 */
  heldMs: number;
  /** 動態：已完成次數 */
  reps: number;
  /** 動態：正在等第幾個檢查點（從 0 開始） */
  checkpointIndex: number;
  elapsedMs: number;
  attempts: number;
  /** 超過時間或嘗試次數，該顯示「跳過／放寬」了 */
  stuck: boolean;
  relaxed: boolean;
}

export interface AngleDeviation {
  /** 看得清楚的幀數 */
  frames: number;
  /** 其中未達標的幀數 */
  outFrames: number;
  /** 這個角度是「最需要修正的那一項」的幀數（報告的「最常偏差」用這個） */
  worstFrames: number;
  /** 身為最需要修正那一項時，超出容許角度的度數加總 */
  sumWorstExcess: number;
}

export interface StepResult {
  stepId: string;
  name: string;
  outcome: 'passed' | 'skipped';
  attempts: number;
  durationMs: number;
  relaxed: boolean;
  deviations: Record<string, AngleDeviation>;
}

/** 超出容許角度多少度 */
function excess(c: AngleCheck): number {
  return Math.abs(c.diff ?? 0) - c.tolerance;
}

/** 兩幀之間最多算這麼久（避免畫面卡住後一次跳很多時間） */
const MAX_FRAME_GAP_MS = 200;

export class StepEngine {
  private startT: number;
  private lastT: number;
  private extraTolerance = 0;
  private inRange = new Map<string, boolean>();
  private heldMs = 0;
  private reps = 0;
  private checkpointIndex = 0;
  private checkpointSince: number;
  private attempts = 0;
  private failed = 0;
  private stuckSince: number;
  private relaxed = false;
  /** 靜態：是否正在維持中，以及從什麼時候開始超出範圍 */
  private holding = false;
  private outSince: number | null = null;
  /** 動態：每個角度最近一次對「目前檢查點」到位的時間 */
  private lastInAt = new Map<string, number>();
  private deviations: Record<string, AngleDeviation> = {};
  private finished: StepResult | null = null;
  private lastView: StepView | null = null;

  constructor(
    readonly step: ResolvedStep,
    private readonly targets: StepTargets,
    private readonly opts: EngineOptions,
    t: number,
  ) {
    this.startT = this.lastT = this.checkpointSince = this.stuckSince = t;
    for (const a of step.angles) this.deviations[a.id] = { frames: 0, outFrames: 0, worstFrames: 0, sumWorstExcess: 0 };
  }

  get result(): StepResult | null {
    return this.finished;
  }

  /**
   * @param present 畫面中有沒有偵測到人（「跟做」類型只看這個）
   */
  update(t: number, readings: AngleReadings, present = true): StepView {
    if (this.finished) return this.lastView!;
    const dt = Math.min(Math.max(t - this.lastT, 0), MAX_FRAME_GAP_MS);
    this.lastT = t;

    const checks = this.check(readings);
    const visible = present && checks.every((c) => c.value !== null);
    const allInRange = visible && checks.every((c) => c.inRange);
    if (visible) this.recordDeviations(checks);

    if (visible) {
      if (this.step.type === 'static') this.updateStatic(allInRange, dt, t);
      else if (this.step.type === 'dynamic') this.updateDynamic(checks, t);
      else this.updateFollow(dt, t);
    }

    const stuck =
      !this.finished &&
      this.step.type !== 'follow' &&
      (t - this.stuckSince >= this.step.timeoutSec * 1000 || this.failed >= this.step.maxAttempts);
    this.lastView = {
      step: this.step,
      checks,
      visible,
      allInRange,
      heldMs: this.heldMs,
      reps: this.reps,
      checkpointIndex: this.checkpointIndex,
      elapsedMs: t - this.startT,
      attempts: this.attempts,
      stuck,
      relaxed: this.relaxed,
    };
    return this.lastView;
  }

  /** 「放寬標準再試」：容許角度加大，重新計時 */
  relax(extraDeg: number, t: number): void {
    this.extraTolerance += extraDeg;
    this.relaxed = true;
    this.failed = 0;
    this.stuckSince = t;
  }

  /** 「跳過」這一步 */
  skip(t: number): StepResult {
    return this.finish('skipped', t);
  }

  private check(readings: AngleReadings): AngleCheck[] {
    const cp = this.targets.checkpoints[this.checkpointIndex] ?? this.targets.checkpoints[0]!;
    return this.step.angles.map((rule) => {
      const value = readings[rule.id] ?? null;
      const target = cp.angles[rule.id] ?? 0;
      const tolerance = rule.tolerance + this.extraTolerance;
      const diff = value === null ? null : angleDiff(value, target);
      let inRange = false;
      if (diff !== null) {
        // 防閃爍（遲滯）：已在範圍內時，要超出「容許 + 緩衝」才算離開
        const limit = this.inRange.get(rule.id) ? tolerance + this.opts.hysteresisDeg : tolerance;
        inRange = Math.abs(diff) <= limit;
        this.inRange.set(rule.id, inRange);
      }
      return { id: rule.id, name: rule.def.name, value, target, diff, tolerance, inRange, hintLow: rule.hintLow, hintHigh: rule.hintHigh };
    });
  }

  private updateStatic(allIn: boolean, dt: number, t: number): void {
    if (allIn) {
      if (!this.holding) this.attempts++;
      this.holding = true;
      this.outSince = null;
      this.heldMs += dt;
      if (this.step.type === 'static' && this.heldMs >= this.step.holdMs) this.finish('passed', t);
    } else if (this.holding) {
      // 短暫跑出範圍（例如骨架抖一下）：寬限時間內暫停計時、不歸零
      this.outSince ??= t;
      if (t - this.outSince > this.opts.holdGraceMs) {
        // 真的跑掉了：算一次失敗的嘗試，重新計時
        this.failed++;
        this.heldMs = 0;
        this.holding = false;
        this.outSince = null;
      }
    }
  }

  /** 跟做：人在畫面中就累積時間，滿秒數完成 */
  private updateFollow(dt: number, t: number): void {
    if (this.step.type !== 'follow') return;
    if (this.attempts === 0) this.attempts = 1;
    this.heldMs += dt;
    if (this.heldMs >= this.step.durationSec * 1000) this.finish('passed', t);
  }

  private updateDynamic(checks: AngleCheck[], t: number): void {
    if (this.step.type !== 'dynamic') return;
    const last = this.step.checkpoints.length - 1;
    for (const c of checks) if (c.inRange) this.lastInAt.set(c.id, t);
    // 每個角度都在最近一小段時間內到位過，就算到達這個檢查點
    const reached = checks.every((c) => t - (this.lastInAt.get(c.id) ?? -Infinity) <= this.opts.checkpointWindowMs);
    if (reached) {
      if (this.checkpointIndex === 0) this.attempts++;
      if (this.checkpointIndex === last) {
        this.reps++;
        this.checkpointIndex = 0;
        if (this.reps >= this.step.reps) this.finish('passed', t);
      } else {
        this.checkpointIndex++;
      }
      this.checkpointSince = t;
      this.inRange.clear(); // 換下一個目標，遲滯狀態重來
      this.lastInAt.clear();
    } else if (this.checkpointIndex > 0 && t - this.checkpointSince > this.opts.repTimeoutSec * 1000) {
      // 做到一半太久沒到下一個檢查點：這次不算，從頭開始
      this.failed++;
      this.checkpointIndex = 0;
      this.checkpointSince = t;
      this.inRange.clear();
      this.lastInAt.clear();
    }
  }

  private recordDeviations(checks: AngleCheck[]): void {
    let worst: AngleCheck | null = null;
    for (const c of checks) {
      const d = this.deviations[c.id]!;
      d.frames++;
      if (!c.inRange) {
        d.outFrames++;
        if (!worst || excess(c) > excess(worst)) worst = c;
      }
    }
    if (worst) {
      const d = this.deviations[worst.id]!;
      d.worstFrames++;
      d.sumWorstExcess += excess(worst);
    }
  }

  private finish(outcome: StepResult['outcome'], t: number): StepResult {
    this.finished ??= {
      stepId: this.step.id,
      name: this.step.name,
      outcome,
      attempts: Math.max(this.attempts, outcome === 'passed' ? 1 : 0),
      durationMs: t - this.startT,
      relaxed: this.relaxed,
      deviations: this.deviations,
    };
    return this.finished;
  }
}

// ───────────── 整套練習 ─────────────

export type SessionEvent = { type: 'passed' | 'skipped'; result: StepResult } | null;

export class Session {
  private index = 0;
  private engine: StepEngine;
  readonly results: StepResult[] = [];
  readonly startT: number;
  endT: number | null = null;

  constructor(
    readonly steps: ResolvedStep[],
    private readonly targets: StepTargets[],
    private readonly opts: EngineOptions,
    t: number,
  ) {
    this.startT = t;
    this.engine = new StepEngine(steps[0]!, targets[0]!, opts, t);
  }

  get stepIndex(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.endT !== null;
  }

  get current(): StepEngine {
    return this.engine;
  }

  /** 每一幀呼叫。回傳目前狀態，以及這一幀是否剛好通過一步 */
  update(t: number, readings: AngleReadings, present = true): { view: StepView; event: SessionEvent } {
    const view = this.engine.update(t, readings, present);
    const result = this.engine.result;
    if (result && !this.finished) return { view, event: this.advance(result, t) };
    return { view, event: null };
  }

  skip(t: number): SessionEvent {
    if (this.finished) return null;
    return this.advance(this.engine.skip(t), t);
  }

  relax(extraDeg: number, t: number): void {
    this.engine.relax(extraDeg, t);
  }

  private advance(result: StepResult, t: number): SessionEvent {
    this.results.push(result);
    if (this.index + 1 < this.steps.length) {
      this.index++;
      this.engine = new StepEngine(this.steps[this.index]!, this.targets[this.index]!, this.opts, t);
    } else {
      this.endT = t;
    }
    return { type: result.outcome, result };
  }
}

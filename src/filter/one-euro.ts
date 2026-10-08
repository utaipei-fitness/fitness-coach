// One Euro 平滑濾波（Casiez et al., 2012）：
// 動作慢時強力平滑（去抖動），動作快時減少平滑（降低延遲）。
// 參數放在 config/settings.json 的 pose.smoothing。
import type { Landmark, PoseFrame } from '../pose/types';

export interface OneEuroParams {
  /** 最低截止頻率（Hz）：越小越平滑，但慢動作時反應越遲鈍 */
  minCutoff: number;
  /** 速度係數：越大，快速動作時延遲越小 */
  beta: number;
  /** 速度估計的截止頻率（Hz） */
  dCutoff: number;
}

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/** 單一數值的 One Euro 濾波器 */
export class OneEuroFilter {
  private value: number | null = null;
  private speed = 0;
  private lastSec = 0;

  constructor(private readonly params: OneEuroParams) {}

  reset(): void {
    this.value = null;
    this.speed = 0;
  }

  /** @param tSec 時間（秒），必須遞增；時間沒有前進時回傳上一次的結果 */
  filter(x: number, tSec: number): number {
    if (this.value === null) {
      this.value = x;
      this.lastSec = tSec;
      return x;
    }
    const dt = tSec - this.lastSec;
    if (dt <= 0) return this.value;
    this.lastSec = tSec;

    const rawSpeed = (x - this.value) / dt;
    this.speed += smoothingFactor(this.params.dCutoff, dt) * (rawSpeed - this.speed);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(this.speed);
    this.value += smoothingFactor(cutoff, dt) * (x - this.value);
    return this.value;
  }
}

/** 超過這麼久沒有偵測到人，就重新開始濾波（避免從很久以前的位置慢慢滑過來） */
const RESET_AFTER_GAP_MS = 500;

/** 對整個姿態的每個關鍵點（x、y、z）做平滑；可信度不平滑 */
export class PoseSmoother {
  private filters: [OneEuroFilter, OneEuroFilter, OneEuroFilter][] = [];
  private lastT = -Infinity;

  constructor(private readonly params: OneEuroParams) {}

  reset(): void {
    this.filters = [];
    this.lastT = -Infinity;
  }

  apply(frame: PoseFrame): PoseFrame {
    if (frame.t - this.lastT > RESET_AFTER_GAP_MS) this.filters = [];
    this.lastT = frame.t;
    const sec = frame.t / 1000;
    const landmarks = frame.landmarks.map((p, i): Landmark => {
      const f = (this.filters[i] ??= [
        new OneEuroFilter(this.params),
        new OneEuroFilter(this.params),
        new OneEuroFilter(this.params),
      ]);
      return { x: f[0].filter(p.x, sec), y: f[1].filter(p.y, sec), z: f[2].filter(p.z, sec), visibility: p.visibility };
    });
    return { ...frame, landmarks };
  }
}

// 效能量測：最近 1 秒處理了幾幀（FPS），以及每幀平均花幾毫秒。
const WINDOW_MS = 1000;

export class PerfMeter {
  private samples: { at: number; costMs: number }[] = [];

  /** @param at 這一幀處理完的時間（performance.now()）  @param costMs 這一幀花了幾毫秒 */
  record(at: number, costMs: number): void {
    this.samples.push({ at, costMs });
    while (this.samples.length > 0 && at - this.samples[0]!.at > WINDOW_MS) this.samples.shift();
  }

  get fps(): number {
    return this.samples.length;
  }

  get avgMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((s, x) => s + x.costMs, 0) / this.samples.length;
  }
}

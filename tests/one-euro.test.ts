// One Euro 平滑濾波的測試
import { describe, expect, it } from 'vitest';
import { OneEuroFilter, PoseSmoother, type OneEuroParams } from '../src/filter/one-euro';
import type { PoseFrame } from '../src/pose/types';

const params: OneEuroParams = { minCutoff: 1.0, beta: 5.0, dCutoff: 1.0 };
const FPS = 30;

/** 用固定 30fps 餵一串數值，回傳濾波後的結果 */
function run(filter: OneEuroFilter, values: number[]): number[] {
  return values.map((v, i) => filter.filter(v, i / FPS));
}

function std(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

describe('OneEuroFilter', () => {
  it('第一個值直接通過', () => {
    expect(new OneEuroFilter(params).filter(0.42, 0)).toBe(0.42);
  });

  it('輸入不變時，輸出也不變', () => {
    const out = run(new OneEuroFilter(params), Array(30).fill(0.5));
    out.forEach((v) => expect(v).toBeCloseTo(0.5, 10));
  });

  it('靜止時的抖動會被大幅減少', () => {
    // 模擬關鍵點在 0.5 附近 ±0.01 來回抖動
    const noisy = Array.from({ length: 90 }, (_, i) => 0.5 + (i % 2 === 0 ? 0.01 : -0.01));
    const out = run(new OneEuroFilter(params), noisy).slice(30); // 略過開頭
    expect(std(out)).toBeLessThan(std(noisy.slice(30)) * 0.3);
  });

  it('快速移動時跟得上（beta 越大延遲越小）', () => {
    // 1 秒內從 0 移到 1（全畫面寬度），看最後一刻落後多少
    const ramp = Array.from({ length: 31 }, (_, i) => i / 30);
    const lagSlow = 1 - run(new OneEuroFilter({ ...params, beta: 0 }), ramp).at(-1)!;
    const lagFast = 1 - run(new OneEuroFilter(params), ramp).at(-1)!;
    expect(lagFast).toBeLessThan(lagSlow);
    expect(lagFast).toBeLessThan(0.05);
  });

  it('時間沒有前進時，回傳上一次的結果', () => {
    const f = new OneEuroFilter(params);
    f.filter(0, 0);
    const a = f.filter(1, 0.1);
    expect(f.filter(5, 0.1)).toBe(a);
    expect(f.filter(5, 0.05)).toBe(a);
  });

  it('reset 之後重新開始', () => {
    const f = new OneEuroFilter(params);
    run(f, [0, 0, 0]);
    f.reset();
    expect(f.filter(0.9, 10)).toBe(0.9);
  });
});

describe('PoseSmoother', () => {
  function frame(t: number, x: number, visibility = 0.9): PoseFrame {
    const p = { x, y: 0.5, z: 0, visibility };
    return { t, landmarks: Array.from({ length: 33 }, () => ({ ...p })), world: [], width: 1280, height: 720 };
  }

  it('每個關鍵點都有平滑，可信度不變', () => {
    const s = new PoseSmoother(params);
    s.apply(frame(0, 0.5));
    const out = s.apply(frame(33, 0.6, 0.3));
    expect(out.landmarks).toHaveLength(33);
    expect(out.landmarks[0]!.x).toBeGreaterThan(0.5);
    expect(out.landmarks[0]!.x).toBeLessThan(0.6);
    expect(out.landmarks[0]!.visibility).toBe(0.3);
    expect(out.width).toBe(1280);
  });

  it('隔太久沒偵測到人，重新開始平滑（不從舊位置慢慢滑過來）', () => {
    const s = new PoseSmoother(params);
    s.apply(frame(0, 0.1));
    expect(s.apply(frame(2000, 0.9)).landmarks[0]!.x).toBe(0.9);
  });
});

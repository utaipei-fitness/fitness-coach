// 評分的測試
import { describe, expect, it } from 'vitest';
import type { StepResult } from '../src/engine/step-engine';
import { angleScore, scoreSession, scoreStep } from '../src/report/score';

const s = { completionWeight: 0.5, perfectWithin: 0.5, atToleranceScore: 70 };

function result(completion: number, ratios: number[], outcome: StepResult['outcome'] = 'passed'): StepResult {
  return { stepId: 'x', name: 'x', outcome, attempts: 1, durationMs: 1000, relaxed: false, deviations: {}, completion, accuracyRatios: ratios };
}

describe('單一角度分數', () => {
  it('偏差在容許角度一半以內 = 100 分', () => {
    expect(angleScore(0, s)).toBe(100);
    expect(angleScore(0.5, s)).toBe(100);
  });
  it('剛好在容許邊界 = 70 分，超過 2 倍 = 0 分', () => {
    expect(angleScore(1, s)).toBeCloseTo(70);
    expect(angleScore(0.75, s)).toBeCloseTo(85);
    expect(angleScore(1.5, s)).toBeCloseTo(35);
    expect(angleScore(2, s)).toBe(0);
    expect(angleScore(5, s)).toBe(0);
  });
});

describe('每一步與整套的分數', () => {
  it('總分 = 完整度與精確度各半', () => {
    expect(scoreStep(result(1, [0, 1]), s)).toEqual({ completion: 100, accuracy: 85, total: 93 });
  });

  it('跟做沒有精確度，總分 = 完整度', () => {
    expect(scoreStep(result(0.5, []), s)).toEqual({ completion: 50, accuracy: null, total: 50 });
  });

  it('整套：精確度只平均有判定角度的步驟', () => {
    const r = scoreSession([result(1, [0]), result(1, []), result(0, [2], 'skipped')], s);
    expect(r.accuracy).toBe(50); // (100 + 0) / 2
    expect(r.completion).toBe(67);
    expect(r.total).toBe(Math.round((100 + 100 + 0) / 3));
  });
});

// 評分與報告的測試
import { describe, expect, it } from 'vitest';
import type { StepResult } from '../src/engine/step-engine';
import { angleScore, buildReport, stepAccuracy } from '../src/report/score';

const s = { perfectWithin: 0.5, atToleranceScore: 70, needsWorkBelow: 80 };

function result(name: string, ratios: number[], outcome: StepResult['outcome'] = 'passed', worst?: string): StepResult {
  return {
    stepId: name,
    name,
    outcome,
    attempts: 1,
    durationMs: 1000,
    relaxed: false,
    deviations: worst ? { [worst]: { frames: 10, outFrames: 5, worstFrames: 5, sumWorstExcess: 50 } } : {},
    completion: outcome === 'passed' ? 1 : 0,
    accuracyRatios: ratios,
  };
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
  });
});

describe('精確度與報告', () => {
  it('跟做（沒有角度資料）沒有精確度', () => {
    expect(stepAccuracy(result('踏步', []), s)).toBeNull();
    expect(stepAccuracy(result('深蹲', [0, 1]), s)).toBe(85);
  });

  it('整體分數：完成的動作平均精確度、跳過的算 0 分、跟做不列入；跳過的列為未完成；低於 80 分列為需要修正', () => {
    const r = buildReport(
      [result('預備', [0]), result('踏步', []), result('深蹲', [1.2], 'passed', 'leftKnee'), result('開合跳', [], 'skipped')],
      s,
    );
    expect(r.score).toBe(Math.round((100 + 56 + 0) / 3));
    expect(r.incomplete).toEqual(['開合跳']);
    expect(r.needsWork).toEqual([{ name: '深蹲', accuracy: 56, angleId: 'leftKnee' }]);
  });

  it('沒有任何可評分的動作時，分數為 null', () => {
    expect(buildReport([result('踏步', [])], s).score).toBeNull();
  });
});

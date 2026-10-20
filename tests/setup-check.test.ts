// 開始前站位檢查的測試
import { describe, expect, it } from 'vitest';
import type { ResolvedStep } from '../src/config/load';
import { checkSetup, requiredPoints, SetupGate } from '../src/engine/setup-check';
import { makeFrame } from './helpers';

const armStep = {
  id: 'a',
  name: '手',
  type: 'static',
  time: 1,
  holdMs: 1000,
  clip: [0, 1],
  timeoutSec: 60,
  maxAttempts: 5,
  angles: [{ id: 'rightElbow', tolerance: 20, def: { name: '右手肘', group: 'upper', side: 'right', type: 'joint', points: ['rightShoulder', 'rightElbow', 'rightWrist'] } }],
} as ResolvedStep;
const followStep = { id: 'f', name: '踏步', type: 'follow', durationSec: 5, clip: [0, 1], timeoutSec: 60, maxAttempts: 5, angles: [] } as ResolvedStep;

const body = {
  leftShoulder: [0.55, 0.2],
  rightShoulder: [0.45, 0.2],
  rightElbow: [0.4, 0.35],
  rightWrist: [0.38, 0.5],
  leftHip: [0.54, 0.5],
  rightHip: [0.46, 0.5],
  leftKnee: [0.54, 0.7],
  rightKnee: [0.46, 0.7],
  leftAnkle: [0.54, 0.9],
  rightAnkle: [0.46, 0.9],
} as const;

describe('需要哪些部位', () => {
  it('只動手的動作只需要手的部位', () => {
    expect(requiredPoints([armStep]).sort()).toEqual(['rightElbow', 'rightShoulder', 'rightWrist']);
  });
  it('有「跟做」的動作就需要全身', () => {
    expect(requiredPoints([followStep])).toContain('leftAnkle');
  });
});

describe('站位檢查', () => {
  it('需要的部位都看得到、人夠大 → 通過', () => {
    const r = checkSetup(makeFrame(body), requiredPoints([followStep]), 0.5, 0.4);
    expect(r).toEqual({ ok: true, missing: [], tooFar: false });
  });

  it('腳踝看不到 → 不通過，並列出看不到的部位', () => {
    const { leftAnkle: _a, rightAnkle: _b, ...noFeet } = body;
    const r = checkSetup(makeFrame(noFeet), requiredPoints([followStep]), 0.5, 0.4);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['左腳踝', '右腳踝']);
  });

  it('只練手的時候，看不到腳也沒關係', () => {
    const { leftAnkle: _a, rightAnkle: _b, ...noFeet } = body;
    expect(checkSetup(makeFrame(noFeet), requiredPoints([armStep]), 0.5, 0.1).ok).toBe(true);
  });

  it('人太小（離太遠）→ 提示靠近', () => {
    const small = Object.fromEntries(Object.entries(body).map(([k, [x, y]]) => [k, [x, 0.4 + y * 0.2]]));
    const r = checkSetup(makeFrame(small), requiredPoints([followStep]), 0.5, 0.4);
    expect(r.tooFar).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('沒有偵測到人 → 不通過', () => {
    expect(checkSetup(null, ['leftHip'], 0.5, 0.4).ok).toBe(false);
  });
});

describe('連續通過才開始', () => {
  it('要連續通過 1 秒；中間跑掉就重來', () => {
    const g = new SetupGate(1000);
    expect(g.update(true, 0)).toBe(false);
    expect(g.update(true, 600)).toBe(false);
    expect(g.update(false, 700)).toBe(false);
    expect(g.update(true, 800)).toBe(false);
    expect(g.progress(1300)).toBeCloseTo(0.5);
    expect(g.update(true, 1800)).toBe(true);
  });
});

// 差異提示的測試
import { describe, expect, it } from 'vitest';
import { angleValue, pointOf } from '../src/angles/compute';
import type { AngleDef } from '../src/config/schema';
import type { AngleCheck } from '../src/engine/step-engine';
import { alignToReference, arrowSymbol, correctionArrow, topCorrections } from '../src/feedback/feedback';
import { makeFrame } from './helpers';

const raise: AngleDef = { name: '右上臂抬舉', side: 'right', type: 'joint', points: ['rightHip', 'rightShoulder', 'rightElbow'] };

function check(id: string, diff: number | null, tolerance = 10, inRange = false): AngleCheck {
  return { id, name: id, value: diff === null ? null : 90 + diff, target: 90, diff, tolerance, inRange, hintLow: `${id}低`, hintHigh: `${id}高` };
}

describe('最需要修正的項目', () => {
  it('取差最多的前兩個，達標的不列', () => {
    const list = topCorrections([check('a', -15), check('b', 40), check('c', 3, 10, true), check('d', -25)]);
    expect(list.map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('角度太小用 hintLow、太大用 hintHigh', () => {
    const [a, b] = topCorrections([check('a', -30), check('b', 20)]);
    expect(a!.hint).toBe('a低');
    expect(b!.hint).toBe('b高');
  });
});

describe('修正方向箭頭', () => {
  // 面向鏡頭的人：右肩在畫面左邊。手臂垂下（抬舉角約 0 度）
  const armDown = makeFrame({ rightHip: [0.4, 0.8], rightShoulder: [0.4, 0.4], rightElbow: [0.4, 0.6] });

  it('要抬高手臂時，箭頭讓角度變大', () => {
    const arrow = correctionArrow(raise, armDown, 90, 0.5)!;
    expect(arrow).not.toBeNull();
    // 手垂下時，抬高的方向是往身體外側（右手 → 畫面左邊），並稍微往上
    expect(arrow.to.x).toBeLessThan(arrow.from.x);
    expect(arrow.to.y).toBeLessThan(arrow.from.y);
    expect(arrowSymbol(arrow, false)).toBe('←');
    expect(arrowSymbol(arrow, true)).toBe('→'); // 自拍鏡像畫面上是往右
  });

  it('已經很接近目標就不畫箭頭', () => {
    const v = angleValue(raise, armDown, 0.5)!;
    expect(correctionArrow(raise, armDown, v + 0.5, 0.5)).toBeNull();
  });
});

describe('骨架對齊', () => {
  it('以骨盆對齊、以軀幹長度縮放', () => {
    const user = makeFrame({ leftHip: [0.45, 0.8], rightHip: [0.35, 0.8], leftShoulder: [0.45, 0.6], rightShoulder: [0.35, 0.6], nose: [0.4, 0.5] });
    const ref = makeFrame({ leftHip: [0.6, 0.6], rightHip: [0.4, 0.6], leftShoulder: [0.6, 0.2], rightShoulder: [0.4, 0.2] });
    const aligned = alignToReference(user, ref)!;
    const hip = pointOf(aligned, 'midHip')!;
    expect(hip.x).toBeCloseTo(50);
    expect(hip.y).toBeCloseTo(60);
    // 使用者軀幹 20、標準 40：放大 2 倍，鼻子在骨盆上方 30 → 60
    expect(aligned.landmarks[0]!.y * 100).toBeCloseTo(0);
  });
});

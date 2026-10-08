// 角度計算的測試
import { describe, expect, it } from 'vitest';
import { angleDiff, angleValue, mirrorFrame } from '../src/angles/compute';
import type { AngleDef } from '../src/config/schema';
import { makeFrame } from './helpers';

const rightElbow: AngleDef = { name: '右手肘', side: 'right', type: 'joint', points: ['rightShoulder', 'rightElbow', 'rightWrist'] };
const trunkTilt: AngleDef = { name: '軀幹側彎', side: 'center', type: 'segment', points: ['midHip', 'midShoulder'] };

describe('三點夾角 joint', () => {
  it('手臂打直 = 180 度，彎成直角 = 90 度', () => {
    const straight = makeFrame({ rightShoulder: [0.2, 0.5], rightElbow: [0.4, 0.5], rightWrist: [0.6, 0.5] });
    expect(angleValue(rightElbow, straight, 0.5)).toBeCloseTo(180);
    const bent = makeFrame({ rightShoulder: [0.2, 0.5], rightElbow: [0.4, 0.5], rightWrist: [0.4, 0.3] });
    expect(angleValue(rightElbow, bent, 0.5)).toBeCloseTo(90);
  });

  it('會用影像寬高還原真實比例（直式影片不會算歪）', () => {
    // 相對座標看起來是 45 度，但影像寬 100、高 200，實際上 y 方向長一倍
    const f = makeFrame({ rightShoulder: [0.2, 0.5], rightElbow: [0.4, 0.5], rightWrist: [0.6, 0.3] }, { width: 100, height: 200 });
    const expected = 180 - (Math.atan2(40, 20) * 180) / Math.PI;
    expect(angleValue(rightElbow, f, 0.5)).toBeCloseTo(expected);
  });

  it('任何一點可信度太低就回傳 null（不判定）', () => {
    const f = makeFrame({ rightShoulder: [0.2, 0.5], rightElbow: [0.4, 0.5], rightWrist: [0.6, 0.5] }, { visibility: 0.3 });
    expect(angleValue(rightElbow, f, 0.5)).toBeNull();
  });
});

describe('肢段方向 segment', () => {
  const body = (shoulderX: number) =>
    makeFrame({ leftHip: [0.55, 0.6], rightHip: [0.45, 0.6], leftShoulder: [shoulderX + 0.05, 0.3], rightShoulder: [shoulderX - 0.05, 0.3] });

  it('直立 = 0 度（用兩髖、兩肩中點）', () => {
    expect(angleValue(trunkTilt, body(0.5), 0.5)).toBeCloseTo(0);
  });

  it('往自己右側彎（面向鏡頭時是畫面左邊）為正', () => {
    expect(angleValue(trunkTilt, body(0.2), 0.5)).toBeCloseTo(45);
    expect(angleValue(trunkTilt, body(0.8), 0.5)).toBeCloseTo(-45);
  });
});

describe('角度差', () => {
  it('一般情況是相減', () => {
    expect(angleDiff(120, 90)).toBe(30);
    expect(angleDiff(60, 90)).toBe(-30);
  });
  it('跨過 ±180 時取最短的差', () => {
    expect(angleDiff(170, -170)).toBe(-20);
    expect(angleDiff(-170, 170)).toBe(20);
  });
});

describe('鏡射', () => {
  const f = makeFrame({ leftWrist: [0.8, 0.2], rightWrist: [0.3, 0.6] });

  it('左右互換、x 翻轉', () => {
    const m = mirrorFrame(f);
    // 原本的左手腕（x=0.8）變成右手腕，位置 x = 0.2
    expect(m.landmarks[16]!.x).toBeCloseTo(0.2);
    expect(m.landmarks[16]!.y).toBeCloseTo(0.2);
    expect(m.landmarks[15]!.x).toBeCloseTo(0.7);
  });

  it('鏡射兩次回到原樣', () => {
    const back = mirrorFrame(mirrorFrame(f)).landmarks;
    back.forEach((p, i) => {
      expect(p.x).toBeCloseTo(f.landmarks[i]!.x);
      expect(p.y).toBe(f.landmarks[i]!.y);
    });
  });

  it('右手肘角度 = 鏡射前的左手肘角度', () => {
    const leftElbow: AngleDef = { ...rightElbow, side: 'left', points: ['leftShoulder', 'leftElbow', 'leftWrist'] };
    const g = makeFrame({ leftShoulder: [0.6, 0.3], leftElbow: [0.7, 0.4], leftWrist: [0.6, 0.5] });
    expect(angleValue(rightElbow, mirrorFrame(g), 0.5)).toBeCloseTo(angleValue(leftElbow, g, 0.5)!);
  });
});

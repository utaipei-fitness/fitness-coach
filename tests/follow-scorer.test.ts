// 自選影片跟練：比對與計分的測試
import { describe, expect, it } from 'vitest';
import type { AngleDef } from '../src/config/schema';
import { FollowScorer } from '../src/follow/follow-scorer';
import type { ReferenceData } from '../src/reference/reference-data';
import { makeFrame } from './helpers';

const angles: Record<string, AngleDef> = {
  rightElbow: { name: '右手肘', side: 'right', group: 'upper', type: 'joint', points: ['rightShoulder', 'rightElbow', 'rightWrist'] },
  leftElbow: { name: '左手肘', side: 'left', group: 'upper', type: 'joint', points: ['leftShoulder', 'leftElbow', 'leftWrist'] },
};

/** 兩手手肘都是 deg 度的姿勢（手腕繞著手肘轉） */
function pose(deg: number) {
  const r = (deg * Math.PI) / 180;
  return makeFrame({
    rightShoulder: [0.3, 0.5],
    rightElbow: [0.4, 0.5],
    rightWrist: [0.4 - 0.1 * Math.cos(r), 0.5 - 0.1 * Math.sin(r)],
    leftShoulder: [0.7, 0.5],
    leftElbow: [0.6, 0.5],
    leftWrist: [0.6 + 0.1 * Math.cos(r), 0.5 - 0.1 * Math.sin(r)],
  });
}

/** 示範影片：每秒 10 幀，手肘角度依 fn(t) 變化 */
function reference(seconds: number, fn: (t: number) => number): ReferenceData {
  const frames = Array.from({ length: seconds * 10 + 1 }, (_, i) => pose(fn(i / 10)));
  return { file: { version: 1, video: 'x', area: [0, 1], fps: 10, model: 'lite', width: 100, height: 100, frames: [] }, frames };
}

const opts = {
  follow: { fps: 10, angles: ['rightElbow', 'leftElbow'], toleranceDeg: 20, lagSec: 1.5, leadSec: 0.3, segmentSec: 5, minCoverage: 0.3 },
  scoring: { perfectWithin: 0.5, atToleranceScore: 70, needsWorkBelow: 80 },
  angles,
  minVisibility: 0.5,
};

describe('跟練比對', () => {
  // 示範：手肘角度從 0 秒的 60 度，每秒增加 10 度
  const ref = reference(10, (t) => 60 + t * 10);

  it('動作完全一樣 = 100 分', () => {
    const s = new FollowScorer(ref, opts);
    const m = s.evaluate(pose(100), 4);
    expect(m.score).toBe(100);
    expect(m.matchedAt).toBeCloseTo(4, 1);
  });

  it('慢 1 秒跟上也不扣分（往前找最像的示範姿勢）', () => {
    const s = new FollowScorer(ref, opts);
    const m = s.evaluate(pose(90), 4); // 影片在 4 秒（100 度），使用者做的是 3 秒的姿勢（90 度）
    expect(m.score).toBe(100);
    expect(m.matchedAt).toBeCloseTo(3, 1);
  });

  it('慢太多（超過 1.5 秒）就會扣分', () => {
    const s = new FollowScorer(ref, opts);
    const m = s.evaluate(pose(60), 5); // 影片在 5 秒（110 度），使用者還在 0 秒的姿勢
    expect(m.score!).toBeLessThan(80);
    expect(m.worst).not.toBeNull();
  });

  it('看不到人時沒有分數', () => {
    const s = new FollowScorer(ref, opts);
    expect(s.evaluate(null, 3).score).toBeNull();
  });
});

describe('跟練成績', () => {
  it('分段計分、找出最常偏差的部位', () => {
    const ref = reference(10, () => 90);
    const s = new FollowScorer(ref, opts);
    for (let t = 0; t < 5; t += 0.1) s.record(s.evaluate(pose(90), t), t); // 前 5 秒做對
    for (let t = 5; t < 10; t += 0.1) s.record(s.evaluate(pose(150), t), t); // 後 5 秒差 60 度
    const sum = s.summary(10);
    expect(sum.segments.map((x) => x.score)).toEqual([100, 0]);
    expect(sum.score).toBe(50);
    expect(sum.parts[0]!.avgDiff).toBe(30);
    expect(sum.coverage).toBe(1);
  });

  it('一段時間大多看不到人，那段不計分', () => {
    const ref = reference(10, () => 90);
    const s = new FollowScorer(ref, opts);
    for (let t = 0; t < 5; t += 0.1) s.record(s.evaluate(pose(90), t), t);
    for (let t = 5; t < 10; t += 0.1) s.record(s.evaluate(null, t), t);
    const sum = s.summary(10);
    expect(sum.segments[1]!.score).toBeNull();
    expect(sum.score).toBe(100);
    expect(sum.coverage).toBeCloseTo(0.5, 1);
  });
});

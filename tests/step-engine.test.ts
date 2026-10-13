// 步驟判定狀態機的測試：靜態維持、動態檢查點順序、防閃爍、逾時、跳過、放寬
import { describe, expect, it } from 'vitest';
import type { ResolvedDynamicStep, ResolvedFollowStep, ResolvedStaticStep } from '../src/config/load';
import { Session, StepEngine } from '../src/engine/step-engine';
import type { StepTargets } from '../src/reference/reference-data';

const elbowDef = { name: '右手肘', side: 'right', type: 'joint', points: ['rightShoulder', 'rightElbow', 'rightWrist'] } as const;
// 基本測試先關掉寬限（0），寬限另外測
const opts = { hysteresisDeg: 5, repTimeoutSec: 5, holdGraceMs: 0, checkpointWindowMs: 0 };

const staticStep: ResolvedStaticStep = {
  id: 'hold',
  name: '維持',
  type: 'static',
  time: 1,
  holdMs: 1000,
  clip: [0, 2],
  timeoutSec: 10,
  maxAttempts: 3,
  angles: [{ id: 'rightElbow', def: { ...elbowDef, points: [...elbowDef.points] }, tolerance: 10, hintLow: '再打直' }],
};
const staticTargets: StepTargets = { stepId: 'hold', checkpoints: [{ name: '姿勢', time: 1, angles: { rightElbow: 90 } }] };

const dynamicStep: ResolvedDynamicStep = {
  id: 'bend',
  name: '彎伸',
  type: 'dynamic',
  checkpoints: [
    { name: '伸直', time: 1 },
    { name: '彎曲', time: 2 },
    { name: '伸直', time: 3 },
  ],
  reps: 2,
  clip: [0, 4],
  timeoutSec: 30,
  maxAttempts: 3,
  angles: [{ id: 'rightElbow', def: { ...elbowDef, points: [...elbowDef.points] }, tolerance: 15 }],
};
const dynamicTargets: StepTargets = {
  stepId: 'bend',
  checkpoints: [
    { name: '伸直', time: 1, angles: { rightElbow: 170 } },
    { name: '彎曲', time: 2, angles: { rightElbow: 60 } },
    { name: '伸直', time: 3, angles: { rightElbow: 170 } },
  ],
};

/** 以 30fps 餵一段固定角度，回傳最後的狀態 */
function feed(engine: StepEngine, from: number, ms: number, angle: number | null) {
  let view = engine.update(from, { rightElbow: angle });
  for (let t = from + 33; t <= from + ms; t += 33) view = engine.update(t, { rightElbow: angle });
  return view;
}

describe('靜態動作', () => {
  it('在範圍內連續維持設定的時間就通過', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    expect(feed(e, 0, 500, 95).heldMs).toBeGreaterThan(400);
    expect(e.result).toBeNull();
    feed(e, 533, 600, 95);
    expect(e.result?.outcome).toBe('passed');
    expect(e.result?.attempts).toBe(1);
  });

  it('維持到一半跑掉，要重新計時，並算一次失敗', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    feed(e, 0, 600, 90);
    const v = feed(e, 633, 100, 130);
    expect(v.heldMs).toBe(0);
    expect(v.allInRange).toBe(false);
    feed(e, 766, 600, 90);
    expect(e.result).toBeNull();
    expect(feed(e, 1400, 500, 90).attempts).toBe(2);
    expect(e.result?.outcome).toBe('passed');
  });

  it('防閃爍：已達標時，稍微超出容許角度（在緩衝內）不算離開', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    feed(e, 0, 300, 95); // 進入範圍（差 5 度）
    const v = feed(e, 333, 300, 103); // 差 13 度：超過 10 度但在 10+5 以內
    expect(v.allInRange).toBe(true);
    expect(v.heldMs).toBeGreaterThan(500);
  });

  it('防閃爍：還沒進入範圍時，要在容許角度以內才算', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    expect(feed(e, 0, 100, 103).allInRange).toBe(false);
  });

  it('看不清楚時暫停計時，不算失敗', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    feed(e, 0, 500, 90);
    const v = feed(e, 533, 2000, null);
    expect(v.visible).toBe(false);
    expect(v.attempts).toBe(1);
    expect(v.heldMs).toBeGreaterThan(400);
    expect(e.result).toBeNull();
  });

  it('角度差的提示：比標準小用 hintLow', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    const c = e.update(0, { rightElbow: 60 }).checks[0]!;
    expect(c.diff).toBe(-30);
    expect(c.inRange).toBe(false);
    expect(c.hintLow).toBe('再打直');
  });
});

describe('動態動作', () => {
  it('依序經過所有檢查點算一次，做滿次數通過', () => {
    const e = new StepEngine(dynamicStep, dynamicTargets, opts, 0);
    let t = 0;
    for (let rep = 0; rep < 2; rep++) {
      for (const angle of [170, 60, 170]) {
        e.update(t, { rightElbow: angle });
        t += 100;
      }
    }
    expect(e.result?.outcome).toBe('passed');
    expect(e.result?.attempts).toBe(2);
  });

  it('順序不對不算（沒伸直就彎曲）', () => {
    const e = new StepEngine(dynamicStep, dynamicTargets, opts, 0);
    const v = e.update(0, { rightElbow: 60 });
    expect(v.checkpointIndex).toBe(0);
    expect(v.reps).toBe(0);
  });

  it('顯示的是「下一個檢查點」的目標', () => {
    const e = new StepEngine(dynamicStep, dynamicTargets, opts, 0);
    e.update(0, { rightElbow: 170 });
    const v = e.update(33, { rightElbow: 120 });
    expect(v.checkpointIndex).toBe(1);
    expect(v.checks[0]!.target).toBe(60);
  });

  it('做到一半太久沒到下一個檢查點，從頭開始並算一次失敗', () => {
    const e = new StepEngine(dynamicStep, dynamicTargets, opts, 0);
    e.update(0, { rightElbow: 170 });
    const v = feed(e, 33, 5100, 120);
    expect(v.checkpointIndex).toBe(0);
    feed(e, 5200, 100, 60);
    expect(e.update(5400, { rightElbow: 60 }).checkpointIndex).toBe(0);
  });
});

describe('出口：逾時、跳過、放寬', () => {
  it('超過逾時秒數，stuck 變成 true', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    expect(feed(e, 0, 9000, 150).stuck).toBe(false);
    expect(feed(e, 9033, 1000, 150).stuck).toBe(true);
  });

  it('失敗次數達上限，stuck 變成 true', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    let t = 0;
    for (let i = 0; i < 3; i++) {
      feed(e, t, 300, 90);
      feed(e, t + 333, 100, 150);
      t += 500;
    }
    expect(e.update(t, { rightElbow: 150 }).stuck).toBe(true);
  });

  it('放寬後容許角度變大、重新計時', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    feed(e, 0, 10000, 105);
    e.relax(10, 10100);
    const v = e.update(10133, { rightElbow: 105 });
    expect(v.stuck).toBe(false);
    expect(v.relaxed).toBe(true);
    expect(v.checks[0]!.tolerance).toBe(20);
    expect(v.allInRange).toBe(true);
  });

  it('跳過會記錄為 skipped', () => {
    const e = new StepEngine(staticStep, staticTargets, opts, 0);
    feed(e, 0, 1000, 150);
    expect(e.skip(1100).outcome).toBe('skipped');
  });
});

describe('整套練習 Session', () => {
  it('一步通過後自動進下一步，全部結束後 finished', () => {
    const s = new Session([staticStep, dynamicStep], [staticTargets, dynamicTargets], opts, 0);
    let t = 0;
    let event = null;
    while (!event) {
      event = s.update(t, { rightElbow: 90 }).event;
      t += 33;
    }
    expect(event.type).toBe('passed');
    expect(s.stepIndex).toBe(1);
    expect(s.skip(t)?.type).toBe('skipped');
    expect(s.finished).toBe(true);
    expect(s.results.map((r) => r.outcome)).toEqual(['passed', 'skipped']);
  });

  it('記錄每個角度未達標的幀數（報告用）', () => {
    const s = new Session([staticStep], [staticTargets], opts, 0);
    s.update(0, { rightElbow: 150 });
    s.update(33, { rightElbow: 150 });
    s.skip(66);
    // 差 60 度、容許 10 度：每幀超出 50 度
    expect(s.results[0]!.deviations['rightElbow']).toMatchObject({ frames: 2, outFrames: 2, worstFrames: 2, sumWorstExcess: 100 });
  });
});

describe('降低敏感度（寬限）', () => {
  const lenient = { ...opts, holdGraceMs: 300, checkpointWindowMs: 500 };

  it('靜態：維持途中跑出範圍不到寬限時間，計時不歸零', () => {
    const e = new StepEngine(staticStep, staticTargets, lenient, 0);
    feed(e, 0, 500, 90);
    const blip = feed(e, 533, 200, 150); // 抖出去 0.2 秒
    expect(blip.heldMs).toBeGreaterThan(400);
    feed(e, 766, 600, 90);
    expect(e.result?.outcome).toBe('passed');
    expect(e.result?.attempts).toBe(1);
  });

  it('靜態：跑出範圍超過寬限時間，仍然要重新計時', () => {
    const e = new StepEngine(staticStep, staticTargets, lenient, 0);
    feed(e, 0, 500, 90);
    expect(feed(e, 533, 500, 150).heldMs).toBe(0);
  });

  it('靜態：寬限期間不累積維持時間（不會因為沒做到而過關）', () => {
    const e = new StepEngine(staticStep, staticTargets, lenient, 0);
    feed(e, 0, 500, 90);
    // 接下來反覆「到位 0.1 秒、跑掉 0.2 秒」：只有到位的時間會累積（0.5 + 3 × 約 0.13 秒，未滿 1 秒）
    let t = 533;
    for (let i = 0; i < 3; i++) {
      feed(e, t, 100, 90);
      feed(e, t + 133, 200, 150);
      t += 366;
    }
    expect(e.result).toBeNull();
  });

  const twoAngle: ResolvedDynamicStep = {
    ...dynamicStep,
    reps: 1,
    angles: [
      ...dynamicStep.angles,
      { id: 'leftElbow', def: { ...elbowDef, name: '左手肘', side: 'left', points: ['leftShoulder', 'leftElbow', 'leftWrist'] }, tolerance: 15 },
    ],
  };
  const twoTargets: StepTargets = {
    stepId: 'bend',
    checkpoints: dynamicTargets.checkpoints.map((c) => ({ ...c, angles: { rightElbow: c.angles['rightElbow']!, leftElbow: c.angles['rightElbow']! } })),
  };

  it('動態：兩手先後在 0.5 秒內到位，也算到達檢查點', () => {
    const e = new StepEngine(twoAngle, twoTargets, lenient, 0);
    e.update(0, { rightElbow: 170, leftElbow: 170 });
    e.update(100, { rightElbow: 60, leftElbow: 120 }); // 右手先到
    const v = e.update(400, { rightElbow: 110, leftElbow: 60 }); // 左手 0.3 秒後到，右手已離開
    expect(v.checkpointIndex).toBe(2);
  });

  it('動態：先後差太久（超過 0.5 秒）就不算', () => {
    const e = new StepEngine(twoAngle, twoTargets, lenient, 0);
    e.update(0, { rightElbow: 170, leftElbow: 170 });
    e.update(100, { rightElbow: 60, leftElbow: 120 });
    const v = e.update(900, { rightElbow: 120, leftElbow: 60 });
    expect(v.checkpointIndex).toBe(1);
  });
});

describe('跟做（follow）', () => {
  const follow: ResolvedFollowStep = {
    id: 'march',
    name: '原地踏步',
    type: 'follow',
    clip: [0, 3],
    durationSec: 2,
    angles: [],
    timeoutSec: 60,
    maxAttempts: 5,
  };
  const targets: StepTargets = { stepId: 'march', checkpoints: [{ name: '跟著做', time: 0, angles: {} }] };

  it('人在畫面中跟著做滿秒數就完成', () => {
    const e = new StepEngine(follow, targets, opts, 0);
    let t = 0;
    while (!e.result && t < 5000) {
      e.update(t, {}, true);
      t += 33;
    }
    expect(e.result?.outcome).toBe('passed');
    expect(t).toBeGreaterThan(1900);
    expect(t).toBeLessThan(2200);
  });

  it('看不到人時暫停計時', () => {
    const e = new StepEngine(follow, targets, opts, 0);
    for (let t = 0; t < 5000; t += 33) e.update(t, {}, false);
    expect(e.result).toBeNull();
  });

  it('跟做不會出現「跳過／放寬」', () => {
    const e = new StepEngine(follow, targets, opts, 0);
    expect(e.update(120000, {}, false).stuck).toBe(false);
  });
});

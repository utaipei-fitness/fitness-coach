// 練習紀錄統計的測試
import { describe, expect, it } from 'vitest';
import { countLastDays, previousFullScore, stepTrends, streakDays, type HistoryRecord } from '../src/storage/history';

function rec(at: string, score: number | null, steps: [string, number | null][] = [], mode: 'full' | 'single' = 'full', variant = 'standing'): HistoryRecord {
  return {
    at,
    variant,
    mode,
    score,
    durationSec: 300,
    steps: steps.map(([id, accuracy]) => ({ id, name: id, outcome: 'passed', accuracy })),
  };
}

const today = new Date('2026-10-20T12:00:00');

describe('連續天數', () => {
  it('今天、昨天、前天都有練 → 3 天', () => {
    expect(streakDays([rec('2026-10-18T09:00:00', 70), rec('2026-10-19T09:00:00', 70), rec('2026-10-20T08:00:00', 70)], today)).toBe(3);
  });
  it('今天還沒練，不算中斷（從昨天往回數）', () => {
    expect(streakDays([rec('2026-10-18T09:00:00', 70), rec('2026-10-19T09:00:00', 70)], today)).toBe(2);
  });
  it('中間斷一天就重算', () => {
    expect(streakDays([rec('2026-10-16T09:00:00', 70), rec('2026-10-20T09:00:00', 70)], today)).toBe(1);
  });
  it('沒有紀錄 → 0', () => {
    expect(streakDays([], today)).toBe(0);
  });
});

describe('其他統計', () => {
  it('最近 7 天練了幾次', () => {
    expect(countLastDays([rec('2026-10-10T09:00:00', 1), rec('2026-10-14T09:00:00', 1), rec('2026-10-20T09:00:00', 1)], today)).toBe(2);
  });

  it('上一次整套練習的分數（不算單獨練習、不算另一個版本）', () => {
    const list = [rec('2026-10-18T09:00:00', 60), rec('2026-10-19T09:00:00', 90, [], 'single'), rec('2026-10-19T10:00:00', 50, [], 'full', 'seated')];
    expect(previousFullScore(list, 'standing')).toBe(60);
    expect(previousFullScore([], 'standing')).toBeNull();
  });

  it('每個動作的趨勢：最近 3 次平均 − 更早 3 次平均', () => {
    const list = [50, 60, 70, 80, 90, 100].map((v, i) => rec(`2026-10-1${i}T09:00:00`, v, [['squat', v]]));
    const [t] = stepTrends(list, 'standing');
    expect(t).toMatchObject({ id: 'squat', latest: 100, recentAvg: 90, change: 30, count: 6 });
  });

  it('資料不夠時沒有變化值', () => {
    const [t] = stepTrends([rec('2026-10-19T09:00:00', 70, [['squat', 70]])], 'standing');
    expect(t!.change).toBeNull();
  });
});

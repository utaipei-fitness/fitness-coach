// 練習紀錄：存在這台裝置的瀏覽器裡（localStorage），不上傳。
// 計算用的函式都是純函式（輸入紀錄、輸出結果），方便測試。
import type { StepResult } from '../engine/step-engine';

export interface HistoryStep {
  id: string;
  name: string;
  outcome: StepResult['outcome'];
  /** 精確度 0～100；跟做或沒有資料為 null */
  accuracy: number | null;
}

export interface HistoryRecord {
  /** ISO 時間字串 */
  at: string;
  /** 站姿版／坐姿版 */
  variant: string;
  /** 整套練習，或單獨練習一個動作 */
  mode: 'full' | 'single';
  score: number | null;
  durationSec: number;
  steps: HistoryStep[];
}

const KEY = 'fitness-coach.history';
/** 最多保留幾筆（太多會讓瀏覽器儲存空間不夠） */
const MAX_RECORDS = 500;

export function loadHistory(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRecord(record: HistoryRecord): void {
  try {
    const list = [...loadHistory(), record].slice(-MAX_RECORDS);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 無法使用瀏覽器儲存（例如無痕模式）時，這次不記錄 */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

// ───────────── 統計 ─────────────

/** 本地日期字串 YYYY-MM-DD */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 連續練習天數：從今天（或昨天）往回數，每天至少練一次 */
export function streakDays(records: HistoryRecord[], today: Date): number {
  const days = new Set(records.map((r) => dayKey(new Date(r.at))));
  const d = new Date(today);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // 今天還沒練不算中斷
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** 最近 7 天（含今天）練了幾次 */
export function countLastDays(records: HistoryRecord[], today: Date, days = 7): number {
  const from = new Date(today);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return records.filter((r) => new Date(r.at) >= from).length;
}

/** 同一版本的上一次「整套練習」分數（給結果頁顯示「比上次 +N 分」） */
export function previousFullScore(records: HistoryRecord[], variant: string): number | null {
  const full = records.filter((r) => r.mode === 'full' && r.variant === variant && r.score !== null);
  return full.length ? full[full.length - 1]!.score : null;
}

export interface StepTrend {
  id: string;
  name: string;
  /** 最近一次的精確度 */
  latest: number | null;
  /** 最近 n 次平均 */
  recentAvg: number | null;
  /** 最近 n 次平均 − 更早 n 次平均（正數 = 進步）；資料不夠為 null */
  change: number | null;
  count: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** 每個動作的精確度趨勢（整套和單獨練習都算） */
export function stepTrends(records: HistoryRecord[], variant: string, n = 3): StepTrend[] {
  const byStep = new Map<string, { name: string; values: number[] }>();
  for (const r of records) {
    if (r.variant !== variant) continue;
    for (const s of r.steps) {
      if (s.outcome !== 'passed' || s.accuracy === null) continue;
      const e = byStep.get(s.id) ?? { name: s.name, values: [] };
      e.values.push(s.accuracy);
      byStep.set(s.id, e);
    }
  }
  return [...byStep.entries()].map(([id, { name, values }]) => {
    const recent = values.slice(-n);
    const earlier = values.slice(-2 * n, -n);
    const ra = avg(recent);
    const ea = avg(earlier);
    return { id, name, latest: values.at(-1) ?? null, recentAvg: ra, change: ra !== null && ea !== null ? ra - ea : null, count: values.length };
  });
}

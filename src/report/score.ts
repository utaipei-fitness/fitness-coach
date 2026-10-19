// 評分與極簡報告：整體分數 = 各動作「精確度」的平均（0～100）。
// 參數在 config/settings.json 的 scoring。
import type { Settings } from '../config/schema';
import type { StepResult } from '../engine/step-engine';

type Scoring = Settings['scoring'];

/**
 * 單一角度樣本的分數。ratio = 偏差 ÷ 容許角度。
 * ratio ≤ perfectWithin → 100；ratio = 1（剛好在容許邊界）→ atToleranceScore；ratio ≥ 2 → 0；中間線性。
 */
export function angleScore(ratio: number, s: Scoring): number {
  if (ratio <= s.perfectWithin) return 100;
  if (ratio <= 1) return 100 - ((ratio - s.perfectWithin) / (1 - s.perfectWithin || 1)) * (100 - s.atToleranceScore);
  if (ratio >= 2) return 0;
  return s.atToleranceScore * (2 - ratio);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 這一步的精確度（0～100）；「跟做」或沒有資料時為 null */
export function stepAccuracy(r: StepResult, s: Scoring): number | null {
  return r.accuracyRatios.length ? Math.round(mean(r.accuracyRatios.map((x) => angleScore(x, s)))) : null;
}

/** 這一步最常需要修正的角度代號（最常是「最需要修正那一項」的角度） */
export function worstAngleId(r: StepResult): string | null {
  let bestId: string | null = null;
  let best = 0;
  for (const [id, d] of Object.entries(r.deviations)) {
    if (d.worstFrames > best) {
      best = d.worstFrames;
      bestId = id;
    }
  }
  return bestId;
}

export interface SessionReport {
  /** 整體精確度（完成的動作平均精確度，跳過的算 0 分）；沒有任何可評分的動作時為 null */
  score: number | null;
  /** 每一步的精確度（與 results 對應） */
  steps: (number | null)[];
  /** 未完成（跳過）的動作名稱 */
  incomplete: string[];
  /** 需要修正的動作：精確度低於 needsWorkBelow，附上最需要注意的角度代號 */
  needsWork: { name: string; accuracy: number; angleId: string | null }[];
}

export function buildReport(results: StepResult[], s: Scoring): SessionReport {
  const steps = results.map((r) => stepAccuracy(r, s));
  // 整體分數：完成的動作用精確度，跳過的動作算 0 分（不然只做一個動作也能拿高分）；「跟做」完成的不列入
  const scored = results.flatMap((r, i) => (r.outcome === 'skipped' ? [0] : steps[i] === null ? [] : [steps[i]!]));
  return {
    score: scored.length ? Math.round(mean(scored)) : null,
    steps,
    incomplete: results.filter((r) => r.outcome === 'skipped').map((r) => r.name),
    needsWork: results.flatMap((r, i) => {
      const acc = steps[i];
      if (r.outcome !== 'passed' || acc === null || acc === undefined || acc >= s.needsWorkBelow) return [];
      return [{ name: r.name, accuracy: acc, angleId: worstAngleId(r) }];
    }),
  };
}

/** 分數對應的評語 */
export function scoreComment(score: number): string {
  if (score >= 90) return '動作非常標準';
  if (score >= 75) return '整體不錯，注意下面幾個動作';
  if (score >= 60) return '還有進步空間，照著提示多練習';
  return '先跟著示範慢慢做，熟悉動作';
}

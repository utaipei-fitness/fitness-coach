// 評分：把判定引擎記錄的資料換算成「完整度、精確度、總分」（0～100）。
// 參數在 config/settings.json 的 scoring。
import type { Settings } from '../config/schema';
import type { StepResult } from '../engine/step-engine';

export interface StepScore {
  /** 完整度 0～100 */
  completion: number;
  /** 精確度 0～100；「跟做」或沒有資料時為 null */
  accuracy: number | null;
  /** 這一步的總分 0～100 */
  total: number;
}

export interface SessionScore extends StepScore {
  steps: StepScore[];
}

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

export function scoreStep(r: StepResult, s: Scoring): StepScore {
  const completion = r.completion * 100;
  const accuracy = r.accuracyRatios.length ? mean(r.accuracyRatios.map((x) => angleScore(x, s))) : null;
  const total = accuracy === null ? completion : completion * s.completionWeight + accuracy * (1 - s.completionWeight);
  return { completion: Math.round(completion), accuracy: accuracy === null ? null : Math.round(accuracy), total: Math.round(total) };
}

/** 整套練習：各步分數平均（精確度只平均有判定角度的步驟） */
export function scoreSession(results: StepResult[], s: Scoring): SessionScore {
  const steps = results.map((r) => scoreStep(r, s));
  const accs = steps.flatMap((x) => (x.accuracy === null ? [] : [x.accuracy]));
  return {
    steps,
    completion: steps.length ? Math.round(mean(steps.map((x) => x.completion))) : 0,
    accuracy: accs.length ? Math.round(mean(accs)) : null,
    total: steps.length ? Math.round(mean(steps.map((x) => x.total))) : 0,
  };
}

/** 分數對應的評語 */
export function scoreComment(total: number): string {
  if (total >= 90) return '太棒了！動作非常標準 🏆';
  if (total >= 75) return '做得很好！再注意幾個小細節 👍';
  if (total >= 60) return '不錯的開始，多練習會更好 💪';
  return '先跟著示範慢慢做，熟悉動作最重要 🙂';
}

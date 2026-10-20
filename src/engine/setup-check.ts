// 開始前的站位檢查：這次練習需要的身體部位都看得到、人在畫面裡夠大，維持一下才開始。
// 不碰畫面，方便測試；參數在 settings.json 的 setup。
import { pointOf } from '../angles/compute';
import type { ResolvedStep } from '../config/load';
import { POINT_LABELS, VIRTUAL_POINTS, type LandmarkName, type PointName } from '../pose/landmarks';
import type { PoseFrame } from '../pose/types';

/** 「跟做」或需要全身時要看到的部位 */
const FULL_BODY: LandmarkName[] = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];

/** 這次練習會用到的身體部位（虛擬點換成實際關鍵點）；有「跟做」的動作就要求全身 */
export function requiredPoints(steps: ResolvedStep[]): LandmarkName[] {
  const set = new Set<LandmarkName>();
  for (const s of steps) {
    if (s.type === 'follow') FULL_BODY.forEach((p) => set.add(p));
    for (const a of s.angles) {
      for (const p of a.def.points) {
        if (p in VIRTUAL_POINTS) VIRTUAL_POINTS[p as keyof typeof VIRTUAL_POINTS].forEach((q) => set.add(q));
        else set.add(p as LandmarkName);
      }
    }
  }
  return [...set];
}

export interface SetupCheck {
  ok: boolean;
  /** 看不清楚的部位（中文名稱） */
  missing: string[];
  /** 人在畫面裡太小（離鏡頭太遠） */
  tooFar: boolean;
}

/**
 * @param minBodyHeight 需要的部位從最高到最低，至少要佔畫面高度的比例（0～1）
 */
export function checkSetup(frame: PoseFrame | null, required: LandmarkName[], minVisibility: number, minBodyHeight: number): SetupCheck {
  if (!frame) return { ok: false, missing: ['全身'], tooFar: false };
  const missing: string[] = [];
  const ys: number[] = [];
  for (const name of required) {
    const p = pointOf(frame, name as PointName);
    if (!p || p.visibility < minVisibility || p.y < 0 || p.y > frame.height || p.x < 0 || p.x > frame.width) missing.push(POINT_LABELS[name]);
    else ys.push(p.y);
  }
  const tooFar = missing.length === 0 && ys.length > 1 && (Math.max(...ys) - Math.min(...ys)) / frame.height < minBodyHeight;
  return { ok: missing.length === 0 && !tooFar, missing, tooFar };
}

/** 站位檢查要「連續」通過一段時間才算完成，避免剛好閃過一幀就開始 */
export class SetupGate {
  private okSince: number | null = null;

  constructor(private readonly holdMs: number) {}

  /** @returns 這一幀之後是否完成 */
  update(ok: boolean, t: number): boolean {
    if (!ok) {
      this.okSince = null;
      return false;
    }
    this.okSince ??= t;
    return t - this.okSince >= this.holdMs;
  }

  /** 已連續通過多久（0～1，畫進度用） */
  progress(t: number): number {
    return this.okSince === null ? 0 : Math.min((t - this.okSince) / this.holdMs, 1);
  }
}

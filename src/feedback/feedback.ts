// 差異提示：找出最需要修正的角度、修正方向的箭頭、把使用者骨架對齊疊到標準骨架上。
import { angleDiff, angleValue, pointOf, type PixelPoint } from '../angles/compute';
import type { AngleDef } from '../config/schema';
import type { AngleCheck } from '../engine/step-engine';
import { LANDMARK_NAMES } from '../pose/landmarks';
import type { PoseFrame } from '../pose/types';

export interface Correction {
  id: string;
  name: string;
  /** 使用者 − 目標（度） */
  diff: number;
  /** 設定檔中的提示文字（依角度太小或太大選擇），沒有就是空字串 */
  hint: string;
}

/** 取差最多的前 n 個未達標角度（差值扣掉容許角度後排序） */
export function topCorrections(checks: AngleCheck[], n = 2): Correction[] {
  return checks
    .filter((c) => c.diff !== null && !c.inRange)
    .sort((a, b) => Math.abs(b.diff!) - b.tolerance - (Math.abs(a.diff!) - a.tolerance))
    .slice(0, n)
    .map((c) => ({ id: c.id, name: c.name, diff: c.diff!, hint: (c.diff! < 0 ? c.hintLow : c.hintHigh) ?? '' }));
}

export interface Arrow {
  /** 像素座標（該姿態影像的座標） */
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** 箭頭最多轉幾度（太大的差畫出來的箭頭會繞到奇怪的地方） */
const MAX_ARROW_DEG = 40;

function rotate(p: PixelPoint, pivot: PixelPoint, deg: number): PixelPoint {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * Math.cos(r) - dy * Math.sin(r), y: pivot.y + dx * Math.sin(r) + dy * Math.cos(r), visibility: p.visibility };
}

/**
 * 修正方向的箭頭：把「會動的那一端」（最後一個點）繞著轉軸轉一點，看往哪邊轉會更接近目標角度。
 * 不需要針對每個角度寫規則，新增角度也自動適用。
 */
export function correctionArrow(def: AngleDef, frame: PoseFrame, target: number, minVisibility: number): Arrow | null {
  const current = angleValue(def, frame, minVisibility);
  if (current === null) return null;
  const pivot = pointOf(frame, def.type === 'joint' ? def.points[1] : def.points[0])!;
  const end = pointOf(frame, def.points[def.points.length - 1]!)!;
  const step = Math.min(Math.abs(angleDiff(current, target)), MAX_ARROW_DEG);
  if (step < 1) return null;

  let best: PixelPoint | null = null;
  let bestErr = Math.abs(angleDiff(current, target));
  for (const sign of [1, -1]) {
    const moved = rotate(end, pivot, sign * step);
    const trial = movePoint(frame, def.points[def.points.length - 1]!, moved);
    const v = angleValue(def, trial, 0);
    if (v !== null && Math.abs(angleDiff(v, target)) < bestErr) {
      bestErr = Math.abs(angleDiff(v, target));
      best = moved;
    }
  }
  return best ? { from: { x: end.x, y: end.y }, to: { x: best.x, y: best.y } } : null;
}

/** 回傳一個把某個關鍵點移到新位置的姿態（只用來試算角度） */
function movePoint(frame: PoseFrame, name: string, to: PixelPoint): PoseFrame {
  const idx = LANDMARK_INDEX.get(name);
  if (idx === undefined) return frame;
  const landmarks = frame.landmarks.slice();
  landmarks[idx] = { ...landmarks[idx]!, x: to.x / frame.width, y: to.y / frame.height };
  return { ...frame, landmarks };
}

const LANDMARK_INDEX = new Map<string, number>(LANDMARK_NAMES.map((n, i) => [n, i]));

/** 箭頭在畫面上的方向符號（↑↗→↘↓↙←↖）。mirrored = 畫面有左右翻轉 */
export function arrowSymbol(arrow: Arrow, mirrored: boolean): string {
  const dx = (arrow.to.x - arrow.from.x) * (mirrored ? -1 : 1);
  const dy = arrow.to.y - arrow.from.y;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = 往上，順時針為正
  const symbols = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return symbols[((Math.round(deg / 45) % 8) + 8) % 8]!;
}

/**
 * 把使用者骨架對齊到標準骨架上：以骨盆中心對齊、以軀幹長度（兩髖中點到兩肩中點）縮放。
 * 回傳的姿態使用標準影像的座標，可直接畫在標準畫面上。
 */
export function alignToReference(user: PoseFrame, ref: PoseFrame): PoseFrame | null {
  const uHip = pointOf(user, 'midHip');
  const uSho = pointOf(user, 'midShoulder');
  const rHip = pointOf(ref, 'midHip');
  const rSho = pointOf(ref, 'midShoulder');
  if (!uHip || !uSho || !rHip || !rSho) return null;
  const uLen = Math.hypot(uSho.x - uHip.x, uSho.y - uHip.y);
  const rLen = Math.hypot(rSho.x - rHip.x, rSho.y - rHip.y);
  if (uLen < 1 || rLen < 1) return null;
  const k = rLen / uLen;
  return {
    ...user,
    width: ref.width,
    height: ref.height,
    landmarks: user.landmarks.map((p) => ({
      ...p,
      x: (rHip.x + (p.x * user.width - uHip.x) * k) / ref.width,
      y: (rHip.y + (p.y * user.height - uHip.y) * k) / ref.height,
    })),
  };
}

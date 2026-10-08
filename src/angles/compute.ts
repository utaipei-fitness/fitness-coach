// 角度計算（2D 影像座標）。角度的定義在 config/angles.json。
// 日後改用 3D world landmarks：在 angleValue() 加一個分支即可，其他模組不用改。
import type { AngleDef } from '../config/schema';
import { LANDMARK_NAMES, VIRTUAL_POINTS, type LandmarkName, type PointName } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/types';

const INDEX = Object.fromEntries(LANDMARK_NAMES.map((n, i) => [n, i])) as Record<LandmarkName, number>;

export interface PixelPoint {
  /** 像素座標（已乘回影像寬高） */
  x: number;
  y: number;
  visibility: number;
}

/** 取得某個點的像素座標。虛擬點 = 兩點中點，可信度取兩者較低的。沒有資料回傳 null */
export function pointOf(frame: PoseFrame, name: PointName): PixelPoint | null {
  if (name in VIRTUAL_POINTS) {
    const [a, b] = VIRTUAL_POINTS[name as keyof typeof VIRTUAL_POINTS];
    const pa = pointOf(frame, a);
    const pb = pointOf(frame, b);
    if (!pa || !pb) return null;
    return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, visibility: Math.min(pa.visibility, pb.visibility) };
  }
  const p = frame.landmarks[INDEX[name as LandmarkName]];
  if (!p) return null;
  return { x: p.x * frame.width, y: p.y * frame.height, visibility: p.visibility };
}

const DEG = 180 / Math.PI;

/** 三點夾角：在 b 點量 a-b-c 的角度，0～180 度 */
export function jointAngle(a: PixelPoint, b: PixelPoint, c: PixelPoint): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / n));
  return Math.acos(cos) * DEG;
}

/**
 * 肢段方向：from → to 相對「直立朝上」的角度，-180～180。
 * 正值 = 往被拍者自己的右側傾（被拍者面向鏡頭時，就是往畫面左邊）。
 */
export function segmentAngle(from: PixelPoint, to: PixelPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y; // 影像座標 y 往下為正
  return Math.atan2(-dx, -dy) * DEG;
}

/** 依角度定義計算一個角度。任何一個點可信度低於 minVisibility 就回傳 null（看不清楚，不判定） */
export function angleValue(def: AngleDef, frame: PoseFrame, minVisibility: number): number | null {
  const pts = def.points.map((n) => pointOf(frame, n));
  if (pts.some((p) => !p || p.visibility < minVisibility)) return null;
  const [a, b, c] = pts as PixelPoint[];
  return def.type === 'joint' ? jointAngle(a!, b!, c!) : segmentAngle(a!, b!);
}

/** 使用者角度與目標角度的差（使用者 − 目標），換算到 -180～180 */
export function angleDiff(user: number, target: number): number {
  let d = (user - target) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

// ───────────── 鏡像 ─────────────

const MIRROR_INDEX: number[] = LANDMARK_NAMES.map((name) => {
  const swapped = name.startsWith('left')
    ? `right${name.slice(4)}`
    : name.startsWith('right')
      ? `left${name.slice(5)}`
      : name === 'mouthLeft'
        ? 'mouthRight'
        : name === 'mouthRight'
          ? 'mouthLeft'
          : name;
  return INDEX[swapped as LandmarkName];
});

function mirrorList(list: Landmark[], flipX: (x: number) => number): Landmark[] {
  if (list.length === 0) return list;
  return MIRROR_INDEX.map((src) => {
    const p = list[src]!;
    return { ...p, x: flipX(p.x) };
  });
}

/**
 * 把姿態左右鏡射：x 翻轉，左右關鍵點互換。
 * 鏡射後的姿態，就是「照鏡子跟著做」的人應該擺出的姿勢。
 */
export function mirrorFrame(frame: PoseFrame): PoseFrame {
  return {
    ...frame,
    landmarks: mirrorList(frame.landmarks, (x) => 1 - x),
    world: mirrorList(frame.world, (x) => -x),
  };
}

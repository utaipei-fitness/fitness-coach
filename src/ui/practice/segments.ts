// 角度 ↔ 骨架肢段的對應：未達標時要把哪幾段肢段變紅。
import type { AngleDef } from '../../config/schema';
import { pointSide, VIRTUAL_POINTS, type LandmarkName, type PointName } from '../../pose/landmarks';

export function segmentKey(a: LandmarkName, b: LandmarkName): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const isVirtual = (p: PointName): p is keyof typeof VIRTUAL_POINTS => p in VIRTUAL_POINTS;

/** 虛擬點（例如兩髖中點）換成和另一端同側的真實點（例如右膝 → 右髖） */
function realPoint(p: PointName, other: PointName): LandmarkName {
  if (!isVirtual(p)) return p;
  const [a, b] = VIRTUAL_POINTS[p];
  return pointSide(other) === pointSide(b) ? b : a;
}

const TORSO_SIDES = [segmentKey('leftShoulder', 'leftHip'), segmentKey('rightShoulder', 'rightHip')];

/**
 * 這個角度對應的肢段：
 * - joint：轉軸 → 會動的那一端（例如上臂抬舉 = 肩到肘）；轉軸是虛擬點時，兩邊都算（例如兩腿張開 = 兩條大腿）
 * - segment：用到虛擬點時（軀幹）= 軀幹兩側
 */
export function segmentsForAngle(def: AngleDef): string[] {
  if (def.type === 'segment') {
    const [p, q] = def.points;
    return isVirtual(p) || isVirtual(q) ? TORSO_SIDES : [segmentKey(p, q)];
  }
  const [a, b, c] = def.points;
  const keys = [segmentKey(realPoint(b, c), realPoint(c, b))];
  if (isVirtual(b)) keys.push(segmentKey(realPoint(b, a), realPoint(a, b)));
  return keys;
}

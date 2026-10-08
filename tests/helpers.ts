// 測試用的小工具：用「名稱 → 座標」建立一個姿態
import { LANDMARK_NAMES, type LandmarkName } from '../src/pose/landmarks';
import type { PoseFrame } from '../src/pose/types';

export function makeFrame(
  points: Partial<Record<LandmarkName, [number, number]>>,
  opts: { t?: number; width?: number; height?: number; visibility?: number } = {},
): PoseFrame {
  return {
    t: opts.t ?? 0,
    width: opts.width ?? 100,
    height: opts.height ?? 100,
    landmarks: LANDMARK_NAMES.map((n) => {
      const p = points[n];
      return p ? { x: p[0], y: p[1], z: 0, visibility: opts.visibility ?? 1 } : { x: 0, y: 0, z: 0, visibility: 0 };
    }),
    world: [],
  };
}

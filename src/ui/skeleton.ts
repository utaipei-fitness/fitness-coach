// 在 canvas 上畫骨架。canvas 的寬高要等於影像的原始寬高（這樣關鍵點座標可直接對上）。
import { LANDMARK_NAMES, type LandmarkName } from '../pose/landmarks';
import type { PoseFrame } from '../pose/types';

/** 要畫的肢段（兩個關鍵點連成一條線）。臉部細節不畫，只畫鼻子當頭部位置 */
export const SKELETON_SEGMENTS: readonly [LandmarkName, LandmarkName][] = [
  // 軀幹
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  // 手臂
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  // 腿
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['leftAnkle', 'leftFootIndex'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
  ['rightAnkle', 'rightFootIndex'],
];

const JOINTS: readonly LandmarkName[] = [
  'nose',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
];

const INDEX = Object.fromEntries(LANDMARK_NAMES.map((n, i) => [n, i])) as Record<LandmarkName, number>;

export interface SkeletonStyle {
  /** 預設線條顏色 */
  color: string;
  /** 線條粗細（像素，以影像原始大小計） */
  lineWidth: number;
  /** 可信度低於此值的點不畫 */
  minVisibility: number;
  /** 個別肢段的顏色（例如達標變綠、未達標變紅），沒指定的用 color */
  segmentColor?: (a: LandmarkName, b: LandmarkName) => string | undefined;
  /** 整體透明度 0～1 */
  alpha?: number;
}

export function drawSkeleton(ctx: CanvasRenderingContext2D, frame: PoseFrame, style: SkeletonStyle): void {
  const { width, height } = ctx.canvas;
  const pts = frame.landmarks;
  const visible = (n: LandmarkName) => (pts[INDEX[n]]?.visibility ?? 0) >= style.minVisibility;
  const xy = (n: LandmarkName): [number, number] => {
    const p = pts[INDEX[n]]!;
    return [p.x * width, p.y * height];
  };

  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 先畫深色外框、再畫彩色線，在任何背景上都看得清楚
  for (const pass of ['outline', 'color'] as const) {
    for (const [a, b] of SKELETON_SEGMENTS) {
      if (!visible(a) || !visible(b)) continue;
      ctx.beginPath();
      ctx.moveTo(...xy(a));
      ctx.lineTo(...xy(b));
      if (pass === 'outline') {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = style.lineWidth * 1.5;
      } else {
        ctx.strokeStyle = style.segmentColor?.(a, b) ?? style.color;
        ctx.lineWidth = style.lineWidth;
      }
      ctx.stroke();
    }
  }

  for (const n of JOINTS) {
    if (!visible(n)) continue;
    const [x, y] = xy(n);
    ctx.beginPath();
    ctx.arc(x, y, style.lineWidth * (n === 'nose' ? 1.2 : 0.75), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = style.lineWidth * 0.3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
  }
  ctx.restore();
}

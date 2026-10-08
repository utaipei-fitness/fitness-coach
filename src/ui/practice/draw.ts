// 練習畫面的繪圖小工具：依達標狀態上色的骨架、修正方向箭頭。
import type { AngleCheck } from '../../engine/step-engine';
import type { Arrow } from '../../feedback/feedback';
import type { AppConfig } from '../../config/load';
import type { LandmarkName } from '../../pose/landmarks';
import { segmentKey, segmentsForAngle } from './segments';

export const COLORS = {
  ok: '#22c55e',
  bad: '#ef4444',
  neutral: '#94a3b8',
  overlay: '#f59e0b',
  arrow: '#ef4444',
} as const;

/** 依各角度的達標狀態，回傳「肢段 → 顏色」的函式（給 drawSkeleton 用） */
export function segmentColorer(checks: AngleCheck[], config: AppConfig): (a: LandmarkName, b: LandmarkName) => string | undefined {
  const colors = new Map<string, string>();
  for (const c of checks) {
    if (c.value === null) continue;
    for (const key of segmentsForAngle(config.angles[c.id]!)) {
      // 同一段肢段若有任何一個角度未達標，就顯示紅色
      if (colors.get(key) !== COLORS.bad) colors.set(key, c.inRange ? COLORS.ok : COLORS.bad);
    }
  }
  return (a, b) => colors.get(segmentKey(a, b));
}

/** 畫一個粗箭頭（像素座標） */
export function drawArrow(ctx: CanvasRenderingContext2D, arrow: Arrow, width: number, color: string = COLORS.arrow): void {
  const { from, to } = arrow;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = width * 2.6;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [stroke, w] of [
    ['rgba(255,255,255,0.9)', width * 1.8],
    [color, width],
  ] as const) {
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x - Math.cos(angle) * head * 0.6, to.y - Math.sin(angle) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    const extra = w === width ? 0 : (w - width) * 0.8;
    ctx.moveTo(to.x + Math.cos(angle) * extra, to.y + Math.sin(angle) * extra);
    ctx.lineTo(to.x - Math.cos(angle - 0.5) * (head + extra), to.y - Math.sin(angle - 0.5) * (head + extra));
    ctx.lineTo(to.x - Math.cos(angle + 0.5) * (head + extra), to.y - Math.sin(angle + 0.5) * (head + extra));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 左右翻轉畫布（之後畫的東西都會鏡射），用完記得 ctx.restore() */
export function flipHorizontal(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(ctx.canvas.width, 0);
  ctx.scale(-1, 1);
}

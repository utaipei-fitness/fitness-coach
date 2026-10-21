// 逐幀擷取影片中示範者的骨架（建置工具與「自選影片跟練」共用）。
// 做法：一幀一幀跳到指定時間 → 裁出示範者範圍 → 姿態估計 → 平滑 → 壓縮存起來。
import type { Settings } from '../config/schema';
import { PoseEstimator } from '../pose/estimator';
import { PosePipeline } from '../pose/pipeline';
import { encodeFrame, type ReferenceFile } from './reference-data';

export interface ExtractOptions {
  pose: Settings['pose'];
  /** 示範者在畫面中的左右範圍 [左, 右]，0 = 最左、1 = 最右 */
  area: [number, number];
  /** 每秒取幾幀 */
  fps: number;
  /** 存在結果裡的影片名稱 */
  videoName: string;
  onProgress?: (done: number, total: number) => void;
  /** 中途取消 */
  signal?: AbortSignal;
}

function waitFor(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = () => reject(new Error('影片無法讀取，可能是格式不支援（建議用 mp4）'));
    video.addEventListener(event, () => (video.removeEventListener('error', onError), resolve()), { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export async function extractPoses(video: HTMLVideoElement, opts: ExtractOptions): Promise<ReferenceFile> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitFor(video, 'loadedmetadata');
  video.pause();
  const estimator = await PoseEstimator.create(opts.pose);
  try {
    const pipeline = new PosePipeline(estimator, opts.pose);
    const sx = Math.round(video.videoWidth * opts.area[0]);
    const width = Math.round(video.videoWidth * opts.area[1]) - sx;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const total = Math.floor(video.duration * opts.fps) + 1;
    const frames: (number[] | null)[] = [];
    const base = performance.now();
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException('已取消', 'AbortError');
      video.currentTime = Math.min(i / opts.fps + 0.001, video.duration);
      await waitFor(video, 'seeked');
      ctx.drawImage(video, sx, 0, width, height, 0, 0, width, height);
      const frame = pipeline.process(canvas, width, height, base + (i * 1000) / opts.fps);
      frames.push(frame ? encodeFrame(frame) : null);
      if (i % 5 === 0) opts.onProgress?.(i, total);
    }
    opts.onProgress?.(total, total);
    return { version: 1, video: opts.videoName, area: opts.area, fps: opts.fps, model: opts.pose.model, width, height, frames };
  } finally {
    estimator.close();
  }
}

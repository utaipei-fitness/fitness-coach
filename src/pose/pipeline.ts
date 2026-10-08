// 姿態處理流程：影像 → 姿態估計 → 平滑 → PoseFrame。
// 畫面、判定引擎、錄製都從這裡拿資料，不直接碰估計器或濾波器。
import type { Settings } from '../config/schema';
import { PoseSmoother } from '../filter/one-euro';
import { PoseEstimator } from './estimator';
import type { PoseFrame } from './types';

export class PosePipeline {
  private readonly smoother: PoseSmoother;

  constructor(
    readonly estimator: PoseEstimator,
    pose: Settings['pose'],
  ) {
    this.smoother = new PoseSmoother(pose.smoothing);
  }

  /** 處理一張影像；沒有偵測到人時回傳 null */
  process(image: TexImageSource, width: number, height: number, timestampMs: number): PoseFrame | null {
    const raw = this.estimator.detect(image, width, height, timestampMs);
    return raw ? this.smoother.apply(raw) : null;
  }

  /** 換了影像來源（例如換一支影片）時呼叫，避免把前後兩段的位置平滑在一起 */
  reset(): void {
    this.smoother.reset();
  }
}

// 同樣的模型設定只載入一次（模型檔有數 MB，重複載入很慢）
const cache = new Map<string, Promise<PoseEstimator>>();

export function getEstimator(pose: Settings['pose']): Promise<PoseEstimator> {
  const key = `${pose.model}/${pose.useGpu}`;
  let p = cache.get(key);
  if (!p) {
    p = PoseEstimator.create(pose);
    p.catch(() => cache.delete(key)); // 載入失敗時下次重試
    cache.set(key, p);
  }
  return p;
}

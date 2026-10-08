// 姿態估計：包裝 MediaPipe Pose Landmarker，輸入影像、輸出 PoseFrame。
// 其他模組不直接使用 MediaPipe，日後要換模型或換套件只需要改這個檔案。
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Settings } from '../config/schema';
import type { PoseFrame } from './types';

export type Delegate = 'GPU' | 'CPU';

const BASE = import.meta.env.BASE_URL;

export class PoseEstimator {
  private lastTimestamp = -1;

  private constructor(
    private readonly landmarker: PoseLandmarker,
    readonly delegate: Delegate,
    readonly model: Settings['pose']['model'],
  ) {}

  /** 建立姿態估計器。設定要用 GPU 時會先試 GPU，失敗自動改用 CPU。 */
  static async create(pose: Settings['pose']): Promise<PoseEstimator> {
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
    } catch (err) {
      throw new Error(`MediaPipe 執行檔載入失敗，請重新執行 npm run dev。（${errorText(err)}）`);
    }

    const tryOrder: Delegate[] = pose.useGpu ? ['GPU', 'CPU'] : ['CPU'];
    let lastError: unknown;
    for (const delegate of tryOrder) {
      try {
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_${pose.model}.task`, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        const estimator = new PoseEstimator(landmarker, delegate, pose.model);
        estimator.warmUp(); // 先跑一次，GPU 有問題的裝置會在這裡出錯，改用 CPU
        return estimator;
      } catch (err) {
        lastError = err;
        console.warn(`[pose] 使用 ${delegate} 建立失敗`, err);
      }
    }
    throw new Error(`姿態模型（${pose.model}）載入失敗：${errorText(lastError)}`);
  }

  private warmUp(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext('2d')!.fillRect(0, 0, 64, 64);
    this.detect(canvas, 64, 64, 0);
  }

  /**
   * 偵測一張影像中的人體姿態。
   * @param timestampMs 必須一直變大（MediaPipe 的要求），重複或倒退的時間會自動往後推 1 毫秒
   * @returns 沒有偵測到人時回傳 null
   */
  detect(image: TexImageSource, width: number, height: number, timestampMs: number): PoseFrame | null {
    const t = timestampMs > this.lastTimestamp ? timestampMs : this.lastTimestamp + 1;
    this.lastTimestamp = t;
    const result = this.landmarker.detectForVideo(image as HTMLVideoElement, t);
    const landmarks = result.landmarks[0];
    if (!landmarks || landmarks.length === 0) return null;
    return {
      t,
      landmarks: landmarks.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })),
      world: (result.worldLandmarks[0] ?? []).map(({ x, y, z, visibility }) => ({ x, y, z, visibility })),
      width,
      height,
    };
  }

  close(): void {
    this.landmarker.close();
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

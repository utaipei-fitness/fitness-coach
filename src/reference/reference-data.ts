// 標準動作資料：從標準影片擷取的骨架（generated/reference-poses.json），以及據此算出的每一步目標角度。
// 目標角度在載入時即時計算，所以改了 routine.json 的時間點，不需要重新產生任何檔案。
import { angleValue, mirrorFrame } from '../angles/compute';
import type { AppConfig, ResolvedStep } from '../config/load';
import type { PoseFrame } from '../pose/types';

/** generated/reference-poses.json 的格式（為了檔案小，每個點只存 x、y、可信度） */
export interface ReferenceFile {
  version: 1;
  video: string;
  area: [number, number];
  fps: number;
  model: string;
  /** 裁切後（只含示範者範圍）的影像寬高 */
  width: number;
  height: number;
  /** 第 i 幀的時間 = i / fps 秒；null = 這一幀沒偵測到人 */
  frames: (number[] | null)[];
}

export interface ReferenceData {
  file: ReferenceFile;
  /** 已依 mirrorMode 處理過，左右 = 練習者自己的左右 */
  frames: (PoseFrame | null)[];
}

export function encodeFrame(frame: PoseFrame): number[] {
  const out: number[] = [];
  for (const p of frame.landmarks) out.push(round(p.x, 4), round(p.y, 4), round(p.visibility, 2));
  return out;
}

function round(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

function decodeFrame(data: number[], t: number, width: number, height: number): PoseFrame {
  const landmarks = [];
  for (let i = 0; i < data.length; i += 3) landmarks.push({ x: data[i]!, y: data[i + 1]!, z: 0, visibility: data[i + 2]! });
  return { t, landmarks, world: [], width, height };
}

export function decodeReference(file: ReferenceFile, mirrorMode: 'mirror' | 'sameSide'): ReferenceData {
  const frames = file.frames.map((d, i) => {
    if (!d) return null;
    const f = decodeFrame(d, (i / file.fps) * 1000, file.width, file.height);
    return mirrorMode === 'mirror' ? mirrorFrame(f) : f;
  });
  return { file, frames };
}

/** 取得最接近某個時間（秒）的那一幀 */
export function frameAt(ref: ReferenceData, tSec: number): PoseFrame | null {
  const i = Math.round(tSec * ref.file.fps);
  return ref.frames[Math.min(Math.max(i, 0), ref.frames.length - 1)] ?? null;
}

/** 標準資料是否是用目前的設定擷取的；不是的話回傳原因 */
export function staleReason(ref: ReferenceFile, config: AppConfig): string | null {
  const r = config.routine.reference;
  if (ref.video !== r.video) return `標準資料是從「${ref.video}」擷取的，但設定的影片是「${r.video}」`;
  if (ref.area[0] !== r.area[0] || ref.area[1] !== r.area[1]) return '示範者位置範圍（area）改過了';
  if (ref.fps !== r.fps) return '每秒擷取幀數（fps）改過了';
  if (ref.model !== config.settings.pose.model) return `標準資料用的模型是 ${ref.model}，現在設定的是 ${config.settings.pose.model}（兩邊要一致）`;
  return null;
}

// ───────────── 目標角度 ─────────────

export interface CheckpointTarget {
  name: string;
  time: number;
  /** 角度代號 → 目標角度 */
  angles: Record<string, number>;
}

export interface StepTargets {
  stepId: string;
  /** 靜態步驟只有一個檢查點 */
  checkpoints: CheckpointTarget[];
}

/** 取時間點前後這麼多秒內各幀角度的中位數，避免剛好取到抖動的一幀 */
const TARGET_WINDOW_SEC = 0.1;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function computeTargets(ref: ReferenceData, steps: ResolvedStep[], minVisibility: number): { targets: StepTargets[]; errors: string[] } {
  const errors: string[] = [];
  const fps = ref.file.fps;
  const targets = steps.map((step): StepTargets => {
    const points = step.type === 'static' ? [{ name: '姿勢', time: step.time }] : step.checkpoints;
    return {
      stepId: step.id,
      checkpoints: points.map((cp) => {
        const angles: Record<string, number> = {};
        const from = Math.max(0, Math.round((cp.time - TARGET_WINDOW_SEC) * fps));
        const to = Math.min(ref.frames.length - 1, Math.round((cp.time + TARGET_WINDOW_SEC) * fps));
        for (const rule of step.angles) {
          const values: number[] = [];
          for (let i = from; i <= to; i++) {
            const f = ref.frames[i];
            const v = f ? angleValue(rule.def, f, minVisibility) : null;
            if (v !== null) values.push(v);
          }
          if (values.length === 0) {
            errors.push(`「${step.name}」的「${cp.name}」（${cp.time} 秒）：標準影片在這個時間看不清楚「${rule.def.name}」，請換一個時間點`);
          } else {
            angles[rule.id] = median(values);
          }
        }
        return { name: cp.name, time: cp.time, angles };
      }),
    };
  });
  return { targets, errors };
}

// ───────────── 載入 ─────────────

const loaders = import.meta.glob<ReferenceFile>('/generated/reference-poses.json', { import: 'default' });

/** 讀取擷取好的標準骨架；還沒擷取過就回傳 null */
export async function loadReferenceFile(): Promise<ReferenceFile | null> {
  const load = loaders['/generated/reference-poses.json'];
  return load ? await load() : null;
}

// ───────────── 示範片段（npm run clips 產生，正式網站用） ─────────────

export interface ClipIndex {
  video: string;
  clips: Record<string, { file: string; start: number; end: number }>;
}

const clipIndex = import.meta.glob<ClipIndex>('/generated/clips/index.json', { import: 'default', eager: true })['/generated/clips/index.json'];
const clipUrls = import.meta.glob<string>('/generated/clips/*.mp4', { query: '?url', import: 'default', eager: true });

/**
 * 這一步的示範片段。片段要和目前的影片、clip 時間一致才使用（否則回傳 null，請重新執行 npm run clips）。
 * offset = 片段開頭在原影片中的秒數。
 */
export function stepClip(step: ResolvedStep, video: string, index: ClipIndex | undefined = clipIndex): { url: string; offset: number } | null {
  const entry = index?.clips[step.id];
  if (!index || !entry || index.video !== video || entry.start !== step.clip[0] || entry.end !== step.clip[1]) return null;
  const url = clipUrls[`/generated/clips/${entry.file}`];
  return url ? { url, offset: entry.start } : null;
}

/** 片段和設定對不上的步驟名稱（給建置工具與測試提醒用） */
export function staleClipSteps(steps: ResolvedStep[], video: string, index: ClipIndex | undefined = clipIndex): string[] {
  return steps.filter((s) => {
    const e = index?.clips[s.id];
    return !index || !e || index.video !== video || e.start !== s.clip[0] || e.end !== s.clip[1];
  }).map((s) => s.name);
}

/** 標準影片的網址（只有在開發時、且影片放在 assets/reference/ 才有） */
export function referenceVideoUrl(video: string): string | null {
  return import.meta.env.DEV ? `/assets/reference/${encodeURIComponent(video)}` : null;
}

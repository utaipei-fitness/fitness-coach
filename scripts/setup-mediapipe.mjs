// 準備 MediaPipe 需要的檔案（npm run dev / build 之前會自動執行，不用手動跑）：
//   1. 從 node_modules 複製 WASM 執行檔到 public/mediapipe/wasm/（版本與程式套件一致）
//   2. 第一次執行時，從 Google 官方網址下載三種姿態模型到 public/models/
// 檔案已存在就跳過，所以平常幾乎不花時間。
import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');
const modelDst = join(root, 'public/models');

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const MODELS = ['lite', 'full', 'heavy'];
const modelUrl = (m) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`;

async function size(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function copyWasm() {
  await mkdir(wasmDst, { recursive: true });
  for (const f of WASM_FILES) {
    const src = join(wasmSrc, f);
    const dst = join(wasmDst, f);
    const srcSize = await size(src);
    if (srcSize < 0) throw new Error(`找不到 ${src}，請先執行 npm install`);
    if (srcSize !== (await size(dst))) {
      await copyFile(src, dst);
      console.log(`[mediapipe] 已複製 ${f}`);
    }
  }
}

async function downloadModels() {
  await mkdir(modelDst, { recursive: true });
  for (const m of MODELS) {
    const file = `pose_landmarker_${m}.task`;
    const dst = join(modelDst, file);
    if ((await size(dst)) > 0) continue;
    console.log(`[mediapipe] 下載姿態模型 ${file}（只有第一次需要）…`);
    const res = await fetch(modelUrl(m));
    if (!res.ok) throw new Error(`下載 ${file} 失敗（HTTP ${res.status}），請確認網路連線後再試一次`);
    // 先寫到暫存檔再改名，避免下載到一半中斷時留下壞掉的檔案
    const tmp = `${dst}.download`;
    await writeFile(tmp, new Uint8Array(await res.arrayBuffer()));
    await rename(tmp, dst);
    console.log(`[mediapipe] 完成 ${file}`);
  }
}

try {
  await copyWasm();
  await downloadModels();
} catch (err) {
  console.error(`\n[mediapipe] 準備檔案失敗：${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}

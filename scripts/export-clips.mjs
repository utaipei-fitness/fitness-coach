// 把每一步的示範片段（routine.json 的 clip）從標準影片剪成小檔案，存到 generated/clips/，
// 讓正式網站只放動作片段、不放整支影片。改了步驟或 clip 時間後重新執行：npm run clips
// 使用 macOS 內建的 avconvert，只能在 Mac 上執行。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'generated/clips');

// 用 Vite 載入程式裡的設定檔讀取邏輯，確保片段時間和網頁算的一模一樣
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { loadBundledConfig } = await server.ssrLoadModule('/src/config/bundled.ts');
  const result = loadBundledConfig();
  if (!result.ok) {
    for (const e of result.errors) console.error(`config/${e.file} ${e.where} ${e.field}：${e.message}`);
    throw new Error('設定檔有錯，請先修正');
  }
  const { routine } = result.config;
  const source = join(root, 'assets/reference', routine.reference.video);
  if (!existsSync(source)) throw new Error(`找不到標準影片 ${source}`);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const index = { video: routine.reference.video, clips: {} };
  for (const step of routine.steps) {
    const [start, end] = step.clip;
    const file = `${step.id}.mp4`;
    console.log(`[clips] ${step.name}：${start}～${end} 秒 → generated/clips/${file}`);
    execFileSync('avconvert', ['-s', source, '-p', 'Preset960x540', '-o', join(outDir, file), '--start', String(start), '--duration', String(end - start), '--replace'], {
      stdio: 'ignore',
    });
    index.clips[step.id] = { file, start, end };
  }
  if (routine.reference.music) {
    const [start, end] = routine.reference.music;
    console.log(`[clips] 背景配樂：${start}～${end} 秒 → generated/clips/music.m4a`);
    execFileSync('avconvert', ['-s', source, '-p', 'PresetAppleM4A', '-o', join(outDir, 'music.m4a'), '--start', String(start), '--duration', String(end - start), '--replace'], {
      stdio: 'ignore',
    });
    index.music = { file: 'music.m4a', start, end };
  }
  await writeFile(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log('[clips] 完成');
} catch (err) {
  console.error(`\n[clips] 失敗：${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
} finally {
  await server.close();
}

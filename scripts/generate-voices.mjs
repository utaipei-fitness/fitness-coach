// 用 Microsoft Azure 語音服務，把網站會念的所有句子做成「女聲」「男聲」兩套 mp3，存到 generated/voice/。
// 執行：npm run voices（改了動作名稱或提示文字後再執行一次；已做過的句子會跳過，不會重複用到額度）
// 金鑰放在專案資料夾的 .env.local（不會上傳到 GitHub）：
//   AZURE_SPEECH_KEY=你的金鑰
//   AZURE_SPEECH_REGION=你的區域（例如 eastasia）
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'generated/voice');
/** 免費方案每分鐘最多 20 次請求，所以每次間隔 3.2 秒 */
const GAP_MS = 3200;

async function readEnv() {
  const path = join(root, '.env.local');
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

async function synthesize({ key, region, voice, rate, text }) {
  const ssml = `<speak version="1.0" xml:lang="zh-TW"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'fitness-coach',
      },
      body: ssml,
      });
    } catch (err) {
      // 網路暫時斷線：等一下再試（最多 5 次）
      if (attempt >= 5) throw new Error(`網路連線失敗：${err instanceof Error ? err.message : err}`);
      console.log('[voices] 網路連線中斷，10 秒後重試…');
      await sleep(10000);
      continue;
    }
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (res.status === 429 && attempt < 5) {
      console.log('[voices] 太快了，等 20 秒再試…');
      await sleep(20000);
      continue;
    }
    const hint =
      res.status === 401 ? '（金鑰錯誤，或金鑰和區域不是同一組）' : res.status === 404 ? '（區域名稱可能打錯，例如應為 eastasia）' : '';
    throw new Error(`Azure 回應 ${res.status} ${hint}`);
  }
}

const env = await readEnv();
const key = env.AZURE_SPEECH_KEY;
const region = env.AZURE_SPEECH_REGION;
if (!key || !region || key.includes('貼上')) {
  console.error('\n[voices] 找不到 Azure 金鑰。請在專案資料夾的 .env.local 填入：\n  AZURE_SPEECH_KEY=你的金鑰\n  AZURE_SPEECH_REGION=你的區域（例如 eastasia）\n');
  process.exit(1);
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { loadBundledConfig } = await server.ssrLoadModule('/src/config/bundled.ts');
  const { collectPhrases } = await server.ssrLoadModule('/src/feedback/voice-phrases.ts');
  const result = loadBundledConfig();
  if (!result.ok) throw new Error('設定檔有錯，請先修正（npm run dev 看錯誤說明）');
  const cloud = result.config.settings.voice.cloud;
  const phrases = collectPhrases(result.config);
  const index = { provider: 'Microsoft Azure', female: { voice: cloud.female, files: {} }, male: { voice: cloud.male, files: {} } };

  let made = 0;
  for (const gender of ['female', 'male']) {
    const voice = cloud[gender];
    const dir = join(outDir, gender);
    await mkdir(dir, { recursive: true });
    for (const text of phrases) {
      const file = createHash('sha1').update(`${voice}|${cloud.rate}|${text}`).digest('hex').slice(0, 12) + '.mp3';
      index[gender].files[text] = file;
      if (existsSync(join(dir, file))) continue;
      console.log(`[voices] ${gender === 'female' ? '女聲' : '男聲'}：${text}`);
      await writeFile(join(dir, file), await synthesize({ key, region, voice, rate: cloud.rate, text }));
      made++;
      await sleep(GAP_MS);
    }
    // 刪掉已經用不到的舊音檔
    const keep = new Set(Object.values(index[gender].files));
    for (const f of await readdir(dir)) if (!keep.has(f)) await rm(join(dir, f));
  }
  await writeFile(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`[voices] 完成：共 ${phrases.length} 句 × 2 種聲音，這次新產生 ${made} 個音檔`);
} catch (err) {
  console.error(`\n[voices] 失敗：${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
} finally {
  await server.close();
}

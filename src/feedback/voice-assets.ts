// 雲端語音音檔（npm run voices 產生，放在 generated/voice/）：句子 → 音檔網址。
// 沒有產生過、或句子改過還沒重新產生時，查不到就回傳 null（改用裝置內建語音）。

export type VoiceGender = 'female' | 'male';

interface VoiceIndex {
  provider: string;
  female: { voice: string; files: Record<string, string> };
  male: { voice: string; files: Record<string, string> };
}

const index = import.meta.glob<VoiceIndex>('/generated/voice/index.json', { import: 'default', eager: true })['/generated/voice/index.json'];
const urls = import.meta.glob<string>('/generated/voice/*/*.mp3', { query: '?url', import: 'default', eager: true });

export function voiceClipUrl(gender: VoiceGender, text: string, idx: VoiceIndex | undefined = index): string | null {
  const file = idx?.[gender].files[text];
  return file ? (urls[`/generated/voice/${gender}/${file}`] ?? null) : null;
}

/** 這個聲音有沒有雲端音檔；有的話回傳聲音名稱（例如 zh-TW-YunJheNeural） */
export function cloudVoiceName(gender: VoiceGender, idx: VoiceIndex | undefined = index): string | null {
  return idx && Object.keys(idx[gender].files).length > 0 ? idx[gender].voice : null;
}

/** 有哪些句子還沒有音檔（給測試與排查用） */
export function missingClips(gender: VoiceGender, phrases: string[], idx: VoiceIndex | undefined = index): string[] {
  return phrases.filter((p) => !voiceClipUrl(gender, p, idx));
}

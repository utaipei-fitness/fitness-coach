// 雲端語音音檔：句子清單與查詢
import { describe, expect, it } from 'vitest';
import { loadBundledConfig } from '../src/config/bundled';
import { cloudVoiceName, missingClips, voiceClipUrl } from '../src/feedback/voice-assets';
import { collectPhrases, correctionText, NOT_VISIBLE_TEXT, PREVIEW_TEXT } from '../src/feedback/voice-phrases';

const r = loadBundledConfig();
if (!r.ok) throw new Error('設定檔有錯');
const config = r.config;

describe('語音句子清單', () => {
  const phrases = collectPhrases(config);

  it('包含所有動作名稱、提示文字、入鏡提醒與試聽句子，而且不重複', () => {
    for (const s of config.routine.steps) expect(phrases).toContain(s.name);
    for (const s of config.routine.steps) for (const a of s.angles) if (a.hintLow) expect(phrases).toContain(a.hintLow);
    expect(phrases).toContain(NOT_VISIBLE_TEXT);
    expect(phrases).toContain(PREVIEW_TEXT);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('沒有提示文字時念「注意＋部位」，而且這句也在清單裡', () => {
    expect(correctionText(undefined, '左膝')).toBe('注意左膝');
    expect(correctionText('左腿站直', '左膝')).toBe('左腿站直');
    expect(phrases).toContain('注意左膝');
  });
});

describe('音檔查詢', () => {
  const idx = { provider: 'test', female: { voice: 'F', files: { 深蹲: 'a.mp3' } }, male: { voice: 'M', files: {} } };

  it('沒有音檔的句子查不到（會改用裝置語音）', () => {
    expect(voiceClipUrl('female', '開合跳', idx)).toBeNull();
    expect(cloudVoiceName('male', idx)).toBeNull();
    expect(cloudVoiceName('female', idx)).toBe('F');
  });

  // 產生過雲端語音後，改了動作名稱或提示文字卻忘了重新產生，這個測試會提醒
  it.skipIf(cloudVoiceName('female') === null)('雲端語音音檔齊全；不齊全請執行 npm run voices', () => {
    const phrases = collectPhrases(config);
    expect(missingClips('female', phrases)).toEqual([]);
    expect(missingClips('male', phrases)).toEqual([]);
  });
});

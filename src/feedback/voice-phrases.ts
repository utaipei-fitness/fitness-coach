// 語音會念的所有句子。網站念提示、`npm run voices` 產生雲端語音音檔，都用這裡的定義，確保兩邊一致。
import type { AppConfig } from '../config/load';

/** 看不到全身時的提醒 */
export const NOT_VISIBLE_TEXT = '退後一點，全身入鏡';

/** 站位檢查：人太小（離鏡頭太遠）時的提醒 */
export const CLOSER_TEXT = '再靠近一點';

/** 首頁「試聽」念的句子 */
export const PREVIEW_TEXT = '兩側推。右手再抬高一點。';

/** 修正提示：優先用 routine.json 的提示文字，沒有就念「注意＋部位」 */
export function correctionText(hint: string | undefined, angleName: string): string {
  return hint || `注意${angleName}`;
}

/** 這套設定下，語音可能會念到的所有句子（去除重複） */
export function collectPhrases(config: AppConfig): string[] {
  const phrases = new Set<string>([NOT_VISIBLE_TEXT, CLOSER_TEXT, PREVIEW_TEXT]);
  for (const step of [...config.routine.steps, ...(config.routine.seatedSteps ?? [])]) {
    phrases.add(step.name);
    for (const a of step.angles) {
      phrases.add(correctionText(undefined, a.def.name));
      if (a.hintLow) phrases.add(a.hintLow);
      if (a.hintHigh) phrases.add(a.hintHigh);
    }
  }
  return [...phrases];
}

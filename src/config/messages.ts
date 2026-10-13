// 設定檔錯誤的中文訊息。
// 目標：讓不熟程式的人看得懂「哪裡錯、該怎麼改」。
import { z } from 'zod';
import { printParseErrorCode, type ParseErrorCode } from 'jsonc-parser';

// 其他沒特別翻譯到的錯誤，退回 zod 內建的繁體中文訊息
z.config(z.locales.zhTW());

/** 欄位名稱的中文說明，錯誤訊息會顯示成「tolerance（容許角度）」 */
export const FIELD_LABELS: Record<string, string> = {
  // settings.json
  judge: '判定標準',
  toleranceDeg: '預設容許角度',
  hysteresisDeg: '防閃爍緩衝角度',
  holdMs: '維持毫秒數',
  reps: '次數',
  repTimeoutSec: '動態單次逾時秒數',
  minVisibility: '最低可信度',
  giveUp: '做不到時的出口',
  timeoutSec: '逾時秒數',
  maxAttempts: '最多嘗試次數',
  relaxExtraDeg: '放寬時增加的角度',
  pose: '姿態估計',
  model: '模型種類',
  useGpu: '使用 GPU',
  smoothing: '平滑濾波',
  minCutoff: '最低截止頻率',
  beta: '速度係數',
  dCutoff: '速度截止頻率',
  camera: '鏡頭',
  facingMode: '前／後鏡頭',
  width: '寬度（像素）',
  height: '高度（像素）',
  display: '畫面',
  mirrorMode: '左右對應方式',
  selfieView: '自拍鏡像顯示',
  skeletonWidth: '骨架線條粗細',
  referenceSkeleton: '標準畫面顯示骨架',
  referenceSpeed: '示範影片速度',
  energy: '熱量估算',
  met: 'MET 值',
  // angles.json
  angles: '檢查角度',
  side: '左右側',
  points: '關鍵點',
  // routine.json
  name: '名稱',
  description: '動作說明',
  clip: '示範片段',
  reference: '標準影片',
  video: '影片檔名',
  area: '示範者位置範圍',
  fps: '每秒擷取幾幀',
  steps: '步驟',
  id: '代號',
  type: '判定類型',
  enabled: '是否啟用',
  time: '影片秒數',
  checkpoints: '檢查點',
  tolerance: '容許角度',
  hintLow: '角度不足時的提示',
  hintHigh: '角度超過時的提示',
};

const TYPE_NAMES: Record<string, string> = {
  number: '數字',
  int: '整數',
  string: '文字（要用雙引號 "" 包起來）',
  boolean: '「true 或 false」',
  object: '{ } 物件',
  array: '[ ] 清單',
  undefined: '（沒有填）',
  null: 'null',
};

function describeValue(v: unknown): string {
  if (v === undefined) return '（沒有填）';
  if (Array.isArray(v)) return '[ ] 清單';
  if (v !== null && typeof v === 'object') return '{ } 物件';
  if (typeof v === 'string') return `文字 "${v}"`;
  return `${typeof v === 'number' ? '數字' : ''} ${String(v)}`.trim();
}

/** 找出最接近的候選字（用來提示「是不是打錯字」） */
export function suggest(input: string, candidates: readonly string[]): string | undefined {
  const a = input.toLowerCase();
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = editDistance(a, c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  const limit = Math.max(2, Math.floor(input.length / 3));
  return bestDist <= limit ? best : undefined;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export function didYouMean(input: string, candidates: readonly string[]): string {
  const s = suggest(input, candidates);
  return s ? `，是不是要打「${s}」？` : '';
}

export function unknownKeysMessage(keys: readonly string[], known: readonly string[]): string {
  const parts = keys.map((k) => `「${k}」${didYouMean(k, known)}`);
  return `不認得的欄位${parts.join('、')}（可用的欄位：${known.join('、')}）`;
}

/** 把 zod 的錯誤翻成白話中文（schema 裡有自訂訊息的會優先使用自訂的） */
export const friendlyErrorMap: z.core.$ZodErrorMap = (iss) => {
  switch (iss.code) {
    case 'invalid_type': {
      if (iss.input === undefined) return '這個欄位必須填寫，目前沒有填';
      const expected = TYPE_NAMES[iss.expected] ?? iss.expected;
      let msg = `應該填${expected}，但現在填的是${describeValue(iss.input)}`;
      if (iss.expected === 'int' && typeof iss.input === 'number') msg = `應該是整數，不能有小數點（現在是 ${iss.input}）`;
      if ((iss.expected === 'number' || iss.expected === 'int') && typeof iss.input === 'string' && iss.input.trim() !== '' && !Number.isNaN(Number(iss.input)))
        msg += '（數字不要加引號）';
      if (iss.expected === 'boolean' && typeof iss.input === 'string') msg += '（true / false 不要加引號）';
      return msg;
    }
    case 'invalid_value':
      if (iss.values.length === 1) return `這裡只能填 ${JSON.stringify(iss.values[0])}`;
      return `只能填以下其中之一：${iss.values.map((v) => JSON.stringify(v)).join('、')}`;
    case 'invalid_union':
      if ('options' in iss && Array.isArray(iss.options))
        return `只能填以下其中之一：${(iss.options as unknown[]).map((v) => JSON.stringify(v)).join('、')}`;
      return undefined;
    case 'too_small': {
      const min = String(iss.minimum);
      if (iss.origin === 'array') return `至少要有 ${min} 項`;
      if (iss.origin === 'string') return '不能是空白';
      return iss.inclusive ? `不能小於 ${min}` : `必須大於 ${min}`;
    }
    case 'too_big': {
      const max = String(iss.maximum);
      if (iss.origin === 'array') return `最多只能有 ${max} 項`;
      if (iss.origin === 'string') return `太長了，最多 ${max} 個字`;
      return iss.inclusive ? `不能大於 ${max}` : `必須小於 ${max}`;
    }
    case 'unrecognized_keys':
      return `不認得的欄位${iss.keys.map((k) => `「${k}」`).join('、')}（可能是打錯字）`;
    case 'invalid_key':
      return iss.issues[0]?.message ?? '名稱格式不正確';
    default:
      return undefined;
  }
};

// ── JSON 語法錯誤 ──

const PARSE_ERROR_ZH: Partial<Record<string, string>> = {
  InvalidSymbol: '這裡有看不懂的符號',
  InvalidNumberFormat: '數字格式不正確',
  PropertyNameExpected: '這裡應該是欄位名稱（要用雙引號包起來，例如 "name"）',
  ValueExpected: '這裡少了值，或多了一個逗號',
  ColonExpected: '欄位名稱後面少了冒號「:」',
  CommaExpected: '少了逗號「,」（通常是上一行結尾忘了加）',
  CloseBraceExpected: '少了右大括號「}」',
  CloseBracketExpected: '少了右中括號「]」',
  EndOfFileExpected: '檔案結尾後面還有多餘的內容',
  InvalidCommentToken: '註解格式不正確（請用 // 開頭）',
  UnexpectedEndOfComment: '註解沒有結束（/* 要搭配 */）',
  UnexpectedEndOfString: '文字少了結尾的雙引號「"」',
  UnexpectedEndOfNumber: '數字沒有寫完整',
  InvalidUnicode: '文字裡有不正確的 Unicode 編碼',
  InvalidEscapeCharacter: '文字裡的反斜線「\\」用法不正確',
  InvalidCharacter: '這裡有不允許的字元',
};

// 中文輸入法常不小心打出的全形符號
const FULL_WIDTH: Record<string, string> = {
  '，': ',',
  '：': ':',
  '“': '"',
  '”': '"',
  '「': '"',
  '」': '"',
  '｛': '{',
  '｝': '}',
  '［': '[',
  '］': ']',
  '　': '空白',
};

export function parseErrorMessage(code: ParseErrorCode, text: string, offset: number, length: number): string {
  const name = printParseErrorCode(code);
  let msg = PARSE_ERROR_ZH[name] ?? `JSON 格式錯誤（${name}）`;
  // 檢查錯誤位置附近有沒有全形符號
  const around = text.slice(Math.max(0, offset - 2), offset + Math.max(length, 1) + 2);
  const fw = [...around].find((ch) => ch in FULL_WIDTH);
  if (fw) msg += `。這附近有全形符號「${fw}」，請改成半形「${FULL_WIDTH[fw]}」（切換到英文輸入法再打）`;
  return msg;
}

/** 把字元位置換算成「第幾行第幾個字」 */
export function lineCol(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const col = offset - before.lastIndexOf('\n');
  return { line, col };
}

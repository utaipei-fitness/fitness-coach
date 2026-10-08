// 設定檔載入與錯誤訊息的測試。
// 第一個測試會檢查專案裡「真正的」設定檔（config/），所以改完設定檔跑 npm test 也能抓到錯。
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { loadBundledConfig } from '../src/config/bundled';
import { parseConfigFiles, type ConfigError } from '../src/config/load';

// 錯誤訊息的測試用 tests/fixtures/config/ 的固定設定檔，這樣修改正式設定檔不會讓測試壞掉
const raw = import.meta.glob<string>('/tests/fixtures/config/*.json', { query: '?raw', import: 'default', eager: true });
const realFiles: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, text]) => [path.slice(path.lastIndexOf('/') + 1), text]),
);

/** 以真正的設定檔為基礎，把某個檔案換成另一段文字 */
function withText(file: string, text: string) {
  return { ...realFiles, [file]: text };
}

/** 以真正的設定檔為基礎，改動某個檔案的內容 */
function withEdit(file: string, edit: (data: any) => void) {
  const data = parse(realFiles[file]!);
  edit(data);
  return withText(file, JSON.stringify(data, null, 2));
}

function errorsOf(files: Record<string, string>): ConfigError[] {
  const r = parseConfigFiles(files);
  if (r.ok) throw new Error('預期要有錯誤，結果載入成功');
  return r.errors;
}

function messages(errors: ConfigError[]): string {
  return errors.map((e) => `${e.file} | ${e.where} | ${e.field} | ${e.message}`).join('\n');
}

describe('專案內的設定檔', () => {
  it('config/ 裡的三個設定檔都正確', () => {
    const r = loadBundledConfig();
    expect(r.ok, r.ok ? '' : messages(r.errors)).toBe(true);
  });
});

describe('JSON 語法錯誤', () => {
  it('少了逗號時，指出第幾行', () => {
    const text = realFiles['settings.json']!.replace('"toleranceDeg": 20,', '"toleranceDeg": 20');
    const [e] = errorsOf(withText('settings.json', text));
    expect(e!.where).toMatch(/第 \d+ 行第 \d+ 個字附近/);
    expect(e!.message).toContain('逗號');
  });

  it('打到全形符號時，提醒改成半形', () => {
    const text = realFiles['settings.json']!.replace('"toleranceDeg": 20,', '"toleranceDeg"： 20,');
    const [e] = errorsOf(withText('settings.json', text));
    expect(e!.message).toContain('全形符號「：」');
  });

  it('最後一項多一個逗號沒關係', () => {
    const text = realFiles['settings.json']!.replace('"met": 3.8', '"met": 3.8,');
    expect(parseConfigFiles(withText('settings.json', text)).ok).toBe(true);
  });

  it('檔案不存在或是空的', () => {
    const { ['angles.json']: _omit, ...missing } = realFiles;
    expect(messages(errorsOf(missing))).toContain('找不到這個檔案');
    expect(messages(errorsOf(withText('routine.json', '  ')))).toContain('檔案是空的');
  });
});

describe('settings.json 欄位錯誤', () => {
  it('欄位名稱打錯字時，猜出正確名稱', () => {
    const files = withEdit('settings.json', (d) => {
      d.judge.tolaranceDeg = d.judge.toleranceDeg;
      delete d.judge.toleranceDeg;
    });
    const errors = errorsOf(files);
    // 只報一次「不認得的欄位」，不另外重複報「缺少 toleranceDeg」
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('是不是要打「toleranceDeg」');
  });

  it('真的漏寫欄位時，指出缺少哪個欄位', () => {
    const files = withEdit('settings.json', (d) => delete d.giveUp.maxAttempts);
    const [e] = errorsOf(files);
    expect(e!.field).toBe('giveUp（做不到時的出口） › maxAttempts（最多嘗試次數）');
    expect(e!.message).toContain('這個欄位必須填寫');
  });

  it('數字加了引號', () => {
    const files = withEdit('settings.json', (d) => (d.judge.holdMs = '1500'));
    expect(messages(errorsOf(files))).toContain('數字不要加引號');
  });

  it('選項不在清單內', () => {
    const files = withEdit('settings.json', (d) => (d.display.mirrorMode = 'mirrored'));
    const [e] = errorsOf(files);
    expect(e!.field).toBe('display（畫面） › mirrorMode（左右對應方式）');
    expect(e!.message).toContain('"mirror"、"sameSide"');
  });
});

describe('angles.json 錯誤', () => {
  it('關鍵點名稱打錯字', () => {
    const files = withEdit('angles.json', (d) => (d.angles.leftElbow.points[1] = 'leftElbo'));
    const [e] = errorsOf(files);
    expect(e!.where).toBe('角度「leftElbow」（左手肘）');
    expect(e!.message).toContain('是不是要打「leftElbow」');
  });

  it('左側的角度用到右側的點（複製貼上忘了改）', () => {
    const files = withEdit('angles.json', (d) => (d.angles.leftElbow.points[2] = 'rightWrist'));
    expect(messages(errorsOf(files))).toContain('用到了另一側的點「rightWrist」');
  });

  it('joint 類型只給 2 個點', () => {
    const files = withEdit('angles.json', (d) => d.angles.leftKnee.points.pop());
    expect(messages(errorsOf(files))).toContain('至少要有 3 項');
  });
});

describe('routine.json 錯誤', () => {
  it('錯誤位置會寫出第幾步與步驟名稱', () => {
    const files = withEdit('routine.json', (d) => (d.steps[1].type = 'dyanmic'));
    const [e] = errorsOf(files);
    expect(e!.where).toBe('第 2 步（兩臂上舉放下，arms-overhead）');
    expect(e!.field).toContain('type');
    expect(e!.message).toContain('"static"');
  });

  it('用到 angles.json 沒有的角度代號', () => {
    const files = withEdit('routine.json', (d) => {
      d.steps[0].angles.rightShoulderRiase = d.steps[0].angles.rightShoulderRaise;
      delete d.steps[0].angles.rightShoulderRaise;
    });
    const [e] = errorsOf(files);
    expect(e!.where).toContain('第 1 步');
    expect(e!.message).toContain('angles.json 裡找不到');
    expect(e!.message).toContain('是不是要打「rightShoulderRaise」');
  });

  it('動態步驟的檢查點少於 2 個', () => {
    const files = withEdit('routine.json', (d) => (d.steps[1].checkpoints = [d.steps[1].checkpoints[0]]));
    expect(messages(errorsOf(files))).toContain('至少要有 2 項');
  });

  it('檢查點時間沒有依序變大', () => {
    const files = withEdit('routine.json', (d) => (d.steps[1].checkpoints[1].time = 9));
    const [e] = errorsOf(files);
    expect(e!.field).toContain('第 2 個檢查點');
    expect(e!.message).toContain('依序變大');
  });

  it('步驟代號重複', () => {
    const files = withEdit('routine.json', (d) => (d.steps[2].id = d.steps[0].id));
    expect(messages(errorsOf(files))).toContain('重複了，第 1 步已經用過');
  });

  it('沒有列出任何角度', () => {
    const files = withEdit('routine.json', (d) => (d.steps[0].angles = {}));
    expect(messages(errorsOf(files))).toContain('至少要列出一個要檢查的角度');
  });
});

describe('預設值套用', () => {
  const base = withEdit('routine.json', (d) => {
    d.steps = [
      { id: 'a', name: '靜態A', type: 'static', time: 1, angles: { leftElbow: {}, rightElbow: { tolerance: 7 } } },
      { id: 'b', name: '停用B', type: 'static', time: 2, enabled: false, angles: { leftElbow: {} } },
      {
        id: 'c',
        name: '動態C',
        type: 'dynamic',
        reps: 5,
        timeoutSec: 99,
        checkpoints: [
          { name: '起', time: 3 },
          { name: '落', time: 4 },
        ],
        angles: { trunkTilt: {} },
      },
    ];
  });

  function load() {
    const r = parseConfigFiles(base);
    if (!r.ok) throw new Error(messages(r.errors));
    return r.config;
  }

  it('沒寫的值用 settings.json 的預設值，有寫的就覆蓋', () => {
    const { settings, routine } = load();
    const [a, c] = routine.steps;
    expect(a!.angles.map((x) => x.tolerance)).toEqual([settings.judge.toleranceDeg, 7]);
    expect(a!.type === 'static' && a!.holdMs).toBe(settings.judge.holdMs);
    expect(a!.timeoutSec).toBe(settings.giveUp.timeoutSec);
    expect(c!.type === 'dynamic' && c!.reps).toBe(5);
    expect(c!.timeoutSec).toBe(99);
    expect(c!.maxAttempts).toBe(settings.giveUp.maxAttempts);
  });

  it('enabled: false 的步驟不會出現在練習中', () => {
    expect(load().routine.steps.map((s) => s.id)).toEqual(['a', 'c']);
  });
});

// 讀取並檢查三個設定檔，產生程式其他部分使用的 AppConfig。
// 這裡是純函式（輸入檔案文字、輸出結果），不碰畫面，方便測試。
import { parse, type ParseError } from 'jsonc-parser';
import type { z } from 'zod';
import { pointSide, POINT_LABELS } from '../pose/landmarks';
import { didYouMean, FIELD_LABELS, friendlyErrorMap, lineCol, parseErrorMessage, suggest } from './messages';
import {
  anglesFileSchema,
  routineSchema,
  settingsSchema,
  type AngleDef,
  type AnglesFile,
  type Routine,
  type Settings,
} from './schema';

export const CONFIG_FILES = ['settings.json', 'angles.json', 'routine.json'] as const;
export type ConfigFileName = (typeof CONFIG_FILES)[number];

export interface ConfigError {
  file: string;
  /** 例如「第 2 步（兩臂側平舉，arm-raise）」；沒有就是空字串 */
  where: string;
  /** 例如「angles › rightShoulderRaise › tolerance（容許角度）」 */
  field: string;
  message: string;
}

// ───────────── 套用預設值後的設定（程式其他部分都用這個） ─────────────

export interface ResolvedAngleRule {
  id: string;
  def: AngleDef;
  /** 已套用預設值的容許角度（±度） */
  tolerance: number;
  hintLow?: string;
  hintHigh?: string;
}

interface ResolvedStepCommon {
  id: string;
  name: string;
  description?: string;
  /** 標準畫面循環播放的片段 [開始秒, 結束秒] */
  clip: [number, number];
  angles: ResolvedAngleRule[];
  timeoutSec: number;
  maxAttempts: number;
}

export interface ResolvedStaticStep extends ResolvedStepCommon {
  type: 'static';
  time: number;
  holdMs: number;
}

export interface ResolvedDynamicStep extends ResolvedStepCommon {
  type: 'dynamic';
  checkpoints: { name: string; time: number }[];
  reps: number;
}

export type ResolvedStep = ResolvedStaticStep | ResolvedDynamicStep;

export interface AppConfig {
  settings: Settings;
  angles: AnglesFile['angles'];
  routine: {
    name: string;
    reference: Routine['reference'];
    /** 只包含啟用中的步驟，依練習順序排列 */
    steps: ResolvedStep[];
  };
}

export type LoadResult = { ok: true; config: AppConfig } | { ok: false; errors: ConfigError[] };

// ───────────── 主要入口 ─────────────

/**
 * @param files 檔名 → 檔案內容文字，例如 { 'settings.json': '{ ... }' }
 */
export function parseConfigFiles(files: Partial<Record<string, string>>): LoadResult {
  const errors: ConfigError[] = [];

  const settings = parseOne(files, 'settings.json', settingsSchema, errors);
  const anglesFile = parseOne(files, 'angles.json', anglesFileSchema, errors);
  const routine = parseOne(files, 'routine.json', routineSchema, errors);

  if (!settings || !anglesFile || !routine) return { ok: false, errors };

  errors.push(...checkAngleSides(anglesFile), ...checkRoutineAngles(routine, anglesFile));
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, config: resolve(settings, anglesFile, routine) };
}

function parseOne<S extends z.ZodType>(
  files: Partial<Record<string, string>>,
  file: ConfigFileName,
  schema: S,
  errors: ConfigError[],
): z.infer<S> | undefined {
  const text = files[file];
  if (text === undefined) {
    errors.push({ file, where: '', field: '', message: `找不到這個檔案，請確認 config/${file} 存在` });
    return undefined;
  }
  if (text.trim() === '') {
    errors.push({ file, where: '', field: '', message: '檔案是空的' });
    return undefined;
  }

  const parseErrors: ParseError[] = [];
  const data: unknown = parse(text, parseErrors, { allowTrailingComma: true, disallowComments: false });
  const first = parseErrors[0];
  if (first) {
    // 只報第一個語法錯誤：後面的通常是被第一個連帶影響
    const { line, col } = lineCol(text, first.offset);
    errors.push({
      file,
      where: `第 ${line} 行第 ${col} 個字附近`,
      field: '',
      message: parseErrorMessage(first.error, text, first.offset, first.length),
    });
    return undefined;
  }

  const result = schema.safeParse(data, { error: friendlyErrorMap, reportInput: true });
  if (!result.success) {
    for (const issue of dropMissingCausedByTypo(result.error.issues)) {
      errors.push({ file, ...formatLocation(file, issue.path, data), message: issue.message });
    }
    return undefined;
  }
  return result.data;
}

/**
 * 欄位名稱打錯字時（例如 tolaranceDeg），zod 會同時回報「不認得 tolaranceDeg」和「缺少 toleranceDeg」，
 * 兩者其實是同一個錯，只留前者（它已經提示了正確名稱）。
 */
function dropMissingCausedByTypo(issues: z.core.$ZodIssue[]): z.core.$ZodIssue[] {
  const typos = issues.filter((i) => i.code === 'unrecognized_keys');
  return issues.filter((i) => {
    const key = i.path.at(-1);
    if (i.code !== 'invalid_type' || i.input !== undefined || typeof key !== 'string') return true;
    const parent = i.path.slice(0, -1).join('/');
    return !typos.some((t) => t.path.join('/') === parent && t.keys.some((k) => suggest(k, [key]) === key));
  });
}

// ───────────── 跨檔案檢查 ─────────────

/** angles.json：side 寫左側卻用到右側的點（常見於複製貼上忘了改） */
function checkAngleSides(anglesFile: AnglesFile): ConfigError[] {
  const errors: ConfigError[] = [];
  for (const [id, def] of Object.entries(anglesFile.angles)) {
    if (def.side === 'center') continue;
    const wrong = def.points.find((p) => {
      const s = pointSide(p);
      return s !== 'center' && s !== def.side;
    });
    if (wrong) {
      const sideZh = def.side === 'left' ? '左側' : '右側';
      errors.push({
        file: 'angles.json',
        ...formatLocation('angles.json', ['angles', id, 'points'], anglesFile),
        message: `side 寫的是「${def.side}」（${sideZh}），但用到了另一側的點「${wrong}」（${POINT_LABELS[wrong]}）。可能是複製貼上後忘了改；如果這個角度本來就跨左右兩側，請把 side 改成 "center"`,
      });
    }
  }
  return errors;
}

/** routine.json 用到的角度代號，都必須在 angles.json 裡定義過 */
function checkRoutineAngles(routine: Routine, anglesFile: AnglesFile): ConfigError[] {
  const errors: ConfigError[] = [];
  const known = Object.keys(anglesFile.angles);
  routine.steps.forEach((step, i) => {
    for (const id of Object.keys(step.angles)) {
      if (!(id in anglesFile.angles)) {
        errors.push({
          file: 'routine.json',
          ...formatLocation('routine.json', ['steps', i, 'angles', id], routine),
          message: `角度代號「${id}」在 angles.json 裡找不到${didYouMean(id, known)}`,
        });
      }
    }
  });
  return errors;
}

// ───────────── 套用預設值 ─────────────

/** 沒有指定 clip 時，示範片段 = 時間點前後各多播這麼多秒 */
const CLIP_PADDING_SEC = 1;

function resolve(settings: Settings, anglesFile: AnglesFile, routine: Routine): AppConfig {
  const steps: ResolvedStep[] = routine.steps
    .filter((s) => s.enabled !== false)
    .map((s) => {
      const times = s.type === 'static' ? [s.time] : s.checkpoints.map((c) => c.time);
      const common: ResolvedStepCommon = {
        id: s.id,
        name: s.name,
        description: s.description,
        clip: s.clip ?? [Math.max(0, Math.min(...times) - CLIP_PADDING_SEC), Math.max(...times) + CLIP_PADDING_SEC],
        angles: Object.entries(s.angles).map(([id, rule]) => ({
          id,
          def: anglesFile.angles[id]!,
          tolerance: (rule.tolerance ?? settings.judge.toleranceDeg) + settings.judge.extraToleranceDeg,
          hintLow: rule.hintLow,
          hintHigh: rule.hintHigh,
        })),
        timeoutSec: s.timeoutSec ?? settings.giveUp.timeoutSec,
        maxAttempts: s.maxAttempts ?? settings.giveUp.maxAttempts,
      };
      return s.type === 'static'
        ? { ...common, type: 'static', time: s.time, holdMs: s.holdMs ?? settings.judge.holdMs }
        : { ...common, type: 'dynamic', checkpoints: s.checkpoints, reps: s.reps ?? settings.judge.reps };
    });

  return {
    settings,
    angles: anglesFile.angles,
    routine: { name: routine.name, reference: routine.reference, steps },
  };
}

// ───────────── 錯誤位置的中文描述 ─────────────

function getAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let cur = data;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export function formatLocation(file: string, path: readonly PropertyKey[], data: unknown): { where: string; field: string } {
  const rest = [...path];
  let where = '';

  if (file === 'routine.json' && rest[0] === 'steps' && typeof rest[1] === 'number') {
    const step = getAt(data, ['steps', rest[1]]);
    const names = [str(getAt(step, ['name'])), str(getAt(step, ['id']))].filter(Boolean);
    where = `第 ${rest[1] + 1} 步` + (names.length ? `（${names.join('，')}）` : '');
    rest.splice(0, 2);
  } else if (file === 'angles.json' && rest[0] === 'angles' && typeof rest[1] === 'string') {
    const name = str(getAt(data, ['angles', rest[1], 'name']));
    where = `角度「${rest[1]}」` + (name ? `（${name}）` : '');
    rest.splice(0, 2);
  }

  return { where, field: formatField(rest) };
}

function formatField(path: readonly PropertyKey[]): string {
  const parts = path.map((key, i) => {
    if (typeof key === 'number') {
      return path[i - 1] === 'checkpoints' ? `第 ${key + 1} 個檢查點` : `第 ${key + 1} 個`;
    }
    const k = String(key);
    const label = FIELD_LABELS[k];
    return label ? `${k}（${label}）` : k;
  });
  return parts.join(' › ');
}

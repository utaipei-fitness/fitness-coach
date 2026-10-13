// 三個設定檔（config/*.json）的格式規格。
// 設定檔載入時會用這裡的規格逐欄檢查，錯了就在畫面上用中文指出位置。
// 新增欄位時：在這裡加規格 → 在 messages.ts 的 FIELD_LABELS 加中文名稱 → 更新 CLAUDE.md。
import { z } from 'zod';
import { POINT_NAMES } from '../pose/landmarks';
import { didYouMean, unknownKeysMessage } from './messages';

/** 不允許多餘欄位的物件：打錯字的欄位名稱會被抓出來，而不是被默默忽略 */
function strict<T extends z.ZodRawShape>(shape: T) {
  const known = Object.keys(shape);
  return z.strictObject(shape, {
    error: (iss) => (iss.code === 'unrecognized_keys' ? unknownKeysMessage(iss.keys, known) : undefined),
  });
}

const pointName = z.enum(POINT_NAMES, {
  error: (iss) =>
    typeof iss.input === 'string'
      ? `「${iss.input}」不是有效的關鍵點名稱${didYouMean(iss.input, POINT_NAMES)}（可用名稱見 src/pose/landmarks.ts）`
      : undefined,
});

const angleId = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, { error: '角度代號只能用英文字母和數字，且要以英文字母開頭（例如 rightShoulderRaise）' });

const stepId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, { error: '步驟代號只能用小寫英文、數字和「-」（例如 arm-raise）' });

const degrees = z.number().positive().max(180);
const seconds = z.number().min(0);

// ───────────── settings.json ─────────────

export const settingsSchema = strict({
  judge: strict({
    toleranceDeg: degrees,
    hysteresisDeg: z.number().min(0).max(90),
    holdMs: z.number().int().min(0),
    reps: z.number().int().min(1),
    repTimeoutSec: z.number().positive(),
    minVisibility: z.number().min(0).max(1),
  }),
  giveUp: strict({
    timeoutSec: z.number().positive(),
    maxAttempts: z.number().int().min(1),
    relaxExtraDeg: z.number().min(0).max(90),
  }),
  pose: strict({
    model: z.enum(['lite', 'full', 'heavy']),
    useGpu: z.boolean(),
    smoothing: strict({
      minCutoff: z.number().positive(),
      beta: z.number().min(0),
      dCutoff: z.number().positive(),
    }),
  }),
  camera: strict({
    facingMode: z.enum(['user', 'environment']),
    width: z.number().int().min(160).max(3840),
    height: z.number().int().min(120).max(2160),
  }),
  display: strict({
    mirrorMode: z.enum(['mirror', 'sameSide']),
    selfieView: z.boolean(),
    skeletonWidth: z.number().positive().max(20),
    referenceSkeleton: z.boolean(),
    referenceSpeed: z.number().min(0.25).max(2),
  }),
  energy: strict({
    met: z.number().positive().max(25),
  }),
});

// ───────────── angles.json ─────────────

const angleCommon = {
  name: z.string().min(1),
  side: z.enum(['left', 'right', 'center']),
};

/** 三點夾角：在中間那個點量 0–180 度 */
const jointAngleSchema = strict({
  ...angleCommon,
  type: z.literal('joint'),
  points: z.tuple([pointName, pointName, pointName]),
});

/** 肢段方向角：第一點指向第二點的方向，相對「直立朝上」的角度（-180～180，往練習者自己的右側傾為正） */
const segmentAngleSchema = strict({
  ...angleCommon,
  type: z.literal('segment'),
  points: z.tuple([pointName, pointName]),
});

export const angleDefSchema = z.discriminatedUnion('type', [jointAngleSchema, segmentAngleSchema]);

export const anglesFileSchema = strict({
  angles: z.record(angleId, angleDefSchema),
});

// ───────────── routine.json ─────────────

const angleRuleSchema = strict({
  tolerance: degrees.optional(),
  hintLow: z.string().optional(),
  hintHigh: z.string().optional(),
});

/** [開始秒數, 結束秒數]，結束要比開始晚 */
const timeRange = z.tuple([seconds, seconds]).refine(([a, b]) => b > a, { error: '結束時間要比開始時間晚（格式：[開始秒數, 結束秒數]）' });

const stepCommon = {
  id: stepId,
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  clip: timeRange.optional(),
  angles: z.record(angleId, angleRuleSchema).refine((a) => Object.keys(a).length > 0, {
    error: '至少要列出一個要檢查的角度',
  }),
  timeoutSec: z.number().positive().optional(),
  maxAttempts: z.number().int().min(1).optional(),
};

const staticStepSchema = strict({
  ...stepCommon,
  type: z.literal('static'),
  time: seconds,
  holdMs: z.number().int().min(0).optional(),
});

const checkpointSchema = strict({
  name: z.string().min(1),
  time: seconds,
});

const dynamicStepSchema = strict({
  ...stepCommon,
  type: z.literal('dynamic'),
  checkpoints: z
    .array(checkpointSchema)
    .min(2)
    .superRefine((cps, ctx) => {
      for (let i = 1; i < cps.length; i++) {
        if (cps[i]!.time <= cps[i - 1]!.time) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'time'],
            message: `檢查點的時間要依序變大：這個時間（${cps[i]!.time} 秒）沒有比上一個（${cps[i - 1]!.time} 秒）晚`,
          });
        }
      }
    }),
  reps: z.number().int().min(1).optional(),
});

export const stepSchema = z.discriminatedUnion('type', [staticStepSchema, dynamicStepSchema]);

const ratio = z.number().min(0).max(1);

export const routineSchema = strict({
  name: z.string().min(1),
  reference: strict({
    video: z.string().min(1),
    area: z.tuple([ratio, ratio]).refine(([a, b]) => b > a, { error: '格式為 [左邊界, 右邊界]，右邊界要比左邊界大（0 = 畫面最左、1 = 最右）' }),
    fps: z.number().positive().max(60),
  }),
  steps: z
    .array(stepSchema)
    .min(1)
    .superRefine((steps, ctx) => {
      const seen = new Map<string, number>();
      steps.forEach((s, i) => {
        const first = seen.get(s.id);
        if (first !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'id'],
            message: `代號「${s.id}」重複了，第 ${first + 1} 步已經用過，每一步的代號都要不同`,
          });
        } else {
          seen.set(s.id, i);
        }
      });
    }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type AngleDef = z.infer<typeof angleDefSchema>;
export type AnglesFile = z.infer<typeof anglesFileSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Routine = z.infer<typeof routineSchema>;

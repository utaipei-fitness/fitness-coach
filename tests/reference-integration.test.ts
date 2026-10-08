// 整合測試：用標準影片擷取的真實骨架當作「使用者」，跑一遍判定引擎。
// 示範者自己做的動作，每一步都應該能通過；若失敗，代表時間點或容許角度設得不合理。
import { describe, expect, it } from 'vitest';
import { angleValue } from '../src/angles/compute';
import { loadBundledConfig } from '../src/config/bundled';
import { Session } from '../src/engine/step-engine';
import { computeTargets, decodeReference, type ReferenceFile } from '../src/reference/reference-data';

const files = import.meta.glob<ReferenceFile>('/generated/reference-poses.json', { import: 'default', eager: true });
const file = files['/generated/reference-poses.json'];

describe.skipIf(!file)('用示範者自己的動作跑判定（generated/reference-poses.json）', () => {
  const r = loadBundledConfig();
  if (!r.ok) throw new Error('設定檔有錯');
  const config = r.config;
  const ref = decodeReference(file!, config.settings.display.mirrorMode);
  const { targets, errors } = computeTargets(ref, config.routine.steps, config.settings.judge.minVisibility);

  it('每一步、每個檢查點都算得出目標角度', () => {
    expect(errors).toEqual([]);
  });

  config.routine.steps.forEach((step, i) => {
    it(`第 ${i + 1} 步「${step.name}」：重播示範片段可以通過`, () => {
      const session = new Session([step], [targets[i]!], { hysteresisDeg: config.settings.judge.hysteresisDeg, repTimeoutSec: config.settings.judge.repTimeoutSec }, 0);
      const fps = file!.fps;
      // 重複播放示範片段（最多 10 次），模擬使用者跟著做
      let t = 0;
      for (let loop = 0; loop < 10 && !session.finished; loop++) {
        for (let k = Math.round(step.clip[0] * fps); k <= Math.round(step.clip[1] * fps) && !session.finished; k++) {
          const frame = ref.frames[k];
          const readings: Record<string, number | null> = {};
          for (const a of step.angles) readings[a.id] = frame ? angleValue(a.def, frame, config.settings.judge.minVisibility) : null;
          session.update(t, readings);
          t += 1000 / fps;
        }
      }
      expect(session.results[0]?.outcome).toBe('passed');
    });
  });
});

// 整合測試：用標準影片擷取的真實骨架當作「使用者」，跑一遍判定引擎（站姿版、坐姿版都測）。
// 示範者自己做的動作，每一步都應該能通過；若失敗，代表時間點或容許角度設得不合理。
import { describe, expect, it } from 'vitest';
import { angleValue } from '../src/angles/compute';
import { loadBundledConfig } from '../src/config/bundled';
import type { ResolvedStep } from '../src/config/load';
import { engineOptions, Session } from '../src/engine/step-engine';
import { computeTargets, decodeReference, musicUrl, staleClipSteps, staleReason, type ReferenceFile } from '../src/reference/reference-data';

const files = import.meta.glob<ReferenceFile>('/generated/reference-poses*.json', { import: 'default', eager: true });
const r = loadBundledConfig();
if (!r.ok) throw new Error('設定檔有錯');
const config = r.config;

describe('示範片段與配樂', () => {
  it('示範片段（generated/clips）和 routine.json 的時間一致；不一致請執行 npm run clips', () => {
    expect(staleClipSteps(config.routine.steps, config.routine.reference.video)).toEqual([]);
  });

  it('背景配樂和 routine.json 的設定一致；不一致請執行 npm run clips', () => {
    if (config.routine.reference.music) expect(musicUrl(config.routine.reference)).not.toBeNull();
  });
});

const variants: { name: string; file: ReferenceFile | undefined; steps: ResolvedStep[] | undefined; key: 'standing' | 'seated' }[] = [
  { name: '站姿版', key: 'standing', file: files['/generated/reference-poses.json'], steps: config.routine.steps },
  { name: '坐姿版', key: 'seated', file: files['/generated/reference-poses-seated.json'], steps: config.routine.seatedSteps },
];

for (const v of variants) {
  describe.skipIf(!v.file || !v.steps)(`${v.name}：用示範者自己的動作跑判定`, () => {
    const file = v.file!;
    const steps = v.steps!;
    const ref = decodeReference(file, config.settings.display.mirrorMode);
    const { targets, errors } = computeTargets(ref, steps, config.settings.judge.minVisibility);

    it('標準骨架是用目前的設定擷取的', () => {
      expect(staleReason(file, config, v.key)).toBeNull();
    });

    it('每一步、每個檢查點都算得出目標角度', () => {
      expect(errors).toEqual([]);
    });

    steps.forEach((step, i) => {
      it(`第 ${i + 1} 步「${step.name}」（${step.type}）：重播示範片段可以通過`, () => {
        const session = new Session([step], [targets[i]!], engineOptions(config.settings.judge), 0);
        const fps = file.fps;
        // 重複播放示範片段（最多 10 次），模擬使用者跟著做
        let t = 0;
        for (let loop = 0; loop < 10 && !session.finished; loop++) {
          for (let k = Math.round(step.clip[0] * fps); k <= Math.round(step.clip[1] * fps) && !session.finished; k++) {
            const frame = ref.frames[k];
            const readings: Record<string, number | null> = {};
            for (const a of step.angles) readings[a.id] = frame ? angleValue(a.def, frame, config.settings.judge.minVisibility) : null;
            session.update(t, readings, frame !== null);
            t += 1000 / fps;
          }
        }
        expect(session.results[0]?.outcome).toBe('passed');
      });
    });
  });
}

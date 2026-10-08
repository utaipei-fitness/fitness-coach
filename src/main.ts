// 網頁進入點：載入並檢查設定檔 → 準備標準動作資料 → 首頁 → 練習 → 結果。
import './style.css';
import { loadBundledConfig } from './config/bundled';
import type { AppConfig } from './config/load';
import { openCamera, openVideoFile, type VideoSource } from './input/video-source';
import { computeTargets, decodeReference, loadReferenceFile, staleReason, type ReferenceData, type StepTargets } from './reference/reference-data';
import { renderConfigErrors } from './ui/config-error-view';
import { renderHome } from './ui/home-view';
import { showLiveView } from './ui/live-view';
import { renderFinish } from './ui/practice/finish-view';
import { showPractice } from './ui/practice/practice-view';

const root = document.querySelector<HTMLElement>('#app')!;

type Prepared = { ok: true; reference: ReferenceData; targets: StepTargets[] } | { ok: false; reasons: string[] };

async function prepareReference(config: AppConfig): Promise<Prepared> {
  const file = await loadReferenceFile();
  if (!file) return { ok: false, reasons: ['還沒有標準動作資料：請先用「標準動作建置工具」擷取標準影片的骨架。'] };
  const stale = staleReason(file, config);
  if (stale) return { ok: false, reasons: [`標準動作資料需要重新擷取：${stale}。`] };
  const reference = decodeReference(file, config.settings.display.mirrorMode);
  const { targets, errors } = computeTargets(reference, config.routine.steps, config.settings.judge.minVisibility);
  return errors.length ? { ok: false, reasons: errors } : { ok: true, reference, targets };
}

async function main(): Promise<void> {
  const result = loadBundledConfig();
  if (!result.ok) return renderConfigErrors(root, result.errors);
  const config = result.config;
  const prepared = await prepareReference(config);

  const goHome = (error?: string) =>
    renderHome(root, config, { notReady: prepared.ok ? null : prepared.reasons, error }, {
      onPractice: () => practice(() => openCamera(config.settings.camera)),
      onPracticeWithFile: (file) => practice(() => openVideoFile(file)),
      onCameraTest: async () => {
        try {
          const source = await openCamera(config.settings.camera);
          showLiveView(root, config, source, () => goHome());
        } catch (err) {
          goHome(errorText(err));
        }
      },
    });

  const practice = async (open: () => Promise<VideoSource>): Promise<void> => {
    if (!prepared.ok) return goHome();
    let source: VideoSource;
    try {
      source = await open();
    } catch (err) {
      return goHome(errorText(err));
    }
    showPractice(root, {
      config,
      source,
      reference: prepared.reference,
      targets: prepared.targets,
      onExit: () => goHome(),
      onFinish: (session) =>
        renderFinish(root, config, session, {
          again: () => void practice(open),
          home: () => goHome(),
        }),
    });
  };

  goHome();
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

void main();

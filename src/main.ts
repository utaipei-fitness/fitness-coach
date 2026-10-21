// 網頁進入點：載入並檢查設定檔 → 準備標準動作資料（站姿版／坐姿版）→ 首頁 → 練習 → 結果 → 存紀錄。
import './style.css';
import { loadBundledConfig } from './config/bundled';
import type { AppConfig, ResolvedStep } from './config/load';
import type { Session } from './engine/step-engine';
import { loadMusicOn, setupMusic } from './feedback/music';
import { openCamera, openVideoFile, type VideoSource } from './input/video-source';
import {
  computeTargets,
  decodeReference,
  loadReferenceFile,
  musicUrl,
  staleReason,
  VARIANT_NAMES,
  type ReferenceData,
  type StepTargets,
  type Variant,
} from './reference/reference-data';
import { buildReport } from './report/score';
import { loadHistory, previousFullScore, saveRecord } from './storage/history';
import { renderConfigErrors } from './ui/config-error-view';
import { renderHistory } from './ui/history-view';
import { renderHome } from './ui/home-view';
import { showLiveView } from './ui/live-view';
import { renderFinish } from './ui/practice/finish-view';
import { renderFollowFinish } from './ui/follow/follow-finish-view';
import { renderFollowSetup } from './ui/follow/follow-setup-view';
import { showFollow, unlockedVideo } from './ui/follow/follow-view';
import { primeSpeech } from './feedback/voice';
import type { SavedVideo } from './storage/video-library';
import { showPractice } from './ui/practice/practice-view';

const root = document.querySelector<HTMLElement>('#app')!;

type Prepared = { ok: true; reference: ReferenceData; steps: ResolvedStep[]; targets: StepTargets[] } | { ok: false; reasons: string[] };

function stepsFor(config: AppConfig, v: Variant): ResolvedStep[] | undefined {
  return v === 'seated' ? config.routine.seatedSteps : config.routine.steps;
}

async function prepareReference(config: AppConfig, v: Variant): Promise<Prepared> {
  const steps = stepsFor(config, v);
  if (!steps) return { ok: false, reasons: [`這套健身操沒有設定${VARIANT_NAMES[v]}。`] };
  const file = await loadReferenceFile(v);
  if (!file) return { ok: false, reasons: [`還沒有${VARIANT_NAMES[v]}的標準動作資料：請先用「標準動作建置工具」擷取。`] };
  const stale = staleReason(file, config, v);
  if (stale) return { ok: false, reasons: [`${VARIANT_NAMES[v]}的標準動作資料需要重新擷取：${stale}。`] };
  const reference = decodeReference(file, config.settings.display.mirrorMode);
  const { targets, errors } = computeTargets(reference, steps, config.settings.judge.minVisibility);
  return errors.length ? { ok: false, reasons: errors } : { ok: true, reference, steps, targets };
}

const VARIANT_KEY = 'fitness-coach.variant';

function loadVariant(): Variant {
  try {
    return localStorage.getItem(VARIANT_KEY) === 'seated' ? 'seated' : 'standing';
  } catch {
    return 'standing';
  }
}

function saveVariant(v: Variant): void {
  try {
    localStorage.setItem(VARIANT_KEY, v);
  } catch {
    /* 忽略 */
  }
}

async function main(): Promise<void> {
  const result = loadBundledConfig();
  if (!result.ok) return renderConfigErrors(root, result.errors);
  const config = result.config;
  setupMusic(musicUrl(config.routine.reference), config.settings.music, loadMusicOn(config.settings.music.enabled));

  const hasSeated = config.routine.seatedSteps !== undefined;
  let variant: Variant = hasSeated ? loadVariant() : 'standing';
  const preparedCache = new Map<Variant, Prepared>();
  const prepare = async (v: Variant) => {
    if (!preparedCache.has(v)) preparedCache.set(v, await prepareReference(config, v));
    return preparedCache.get(v)!;
  };

  const goHome = async (error?: string) => {
    const prepared = await prepare(variant);
    renderHome(
      root,
      config,
      {
        notReady: prepared.ok ? null : prepared.reasons,
        error,
        variant,
        variants: hasSeated ? (['standing', 'seated'] as Variant[]) : [],
        steps: prepared.ok ? prepared.steps : (stepsFor(config, variant) ?? config.routine.steps),
      },
      {
        onPractice: () => practice(() => openCamera(config.settings.camera)),
        onPracticeStep: (index) => practice(() => openCamera(config.settings.camera), index),
        onPracticeWithFile: (file) => practice(() => openVideoFile(file)),
        onCameraTest: async () => {
          try {
            const source = await openCamera(config.settings.camera);
            showLiveView(root, config, source, () => void goHome());
          } catch (err) {
            void goHome(errorText(err));
          }
        },
        onVariant: (v) => {
          variant = v;
          saveVariant(v);
          void goHome();
        },
        onHistory: () => renderHistory(root, variant, VARIANT_NAMES[variant], () => void goHome()),
        onFollowNew: (file) =>
          renderFollowSetup(root, config, file, {
            onStart: (saved) => {
              primeSpeech();
              const blob = saved.video ?? file;
              void follow(saved, blob, unlockedVideo(blob));
            },
            onCancel: () => void goHome(),
          }),
        onFollowPlay: (saved, video) => void follow(saved, video, unlockedVideo(video)),
      },
    );
  };

  /** 練習結束：存紀錄，回傳「比上次」的分數差（只有整套練習才比） */
  const record = (session: Session, only: number | undefined): number | null => {
    const report = buildReport(session.results, config.settings.scoring);
    const before = only === undefined ? previousFullScore(loadHistory(), variant) : null;
    saveRecord({
      at: new Date().toISOString(),
      variant,
      mode: only === undefined ? 'full' : 'single',
      score: report.score,
      durationSec: Math.round(((session.endT ?? performance.now()) - session.startT) / 1000),
      steps: session.results.map((r, i) => ({ id: r.stepId, name: r.name, outcome: r.outcome, accuracy: report.steps[i] ?? null })),
    });
    return before !== null && report.score !== null ? report.score - before : null;
  };

  /** 自選影片跟練：refVideo 要在點擊當下建立（unlockedVideo），才能播放影片聲音 */
  const follow = async (saved: SavedVideo, videoBlob: Blob, refVideo: HTMLVideoElement): Promise<void> => {
    let source: VideoSource;
    try {
      source = await openCamera(config.settings.camera);
    } catch (err) {
      URL.revokeObjectURL(refVideo.src);
      return goHome(errorText(err));
    }
    showFollow(root, {
      config,
      saved,
      refVideo,
      source,
      onExit: () => void goHome(),
      onFinish: (summary) =>
        renderFollowFinish(root, saved.name, summary, {
          again: () => {
            primeSpeech();
            void follow(saved, videoBlob, unlockedVideo(videoBlob));
          },
          home: () => void goHome(),
        }),
    });
  };

  /** @param only 只練某一步（首頁點選單一動作時）；不給就練整套 */
  const practice = async (open: () => Promise<VideoSource>, only?: number): Promise<void> => {
    const prepared = await prepare(variant);
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
      steps: only === undefined ? prepared.steps : [prepared.steps[only]!],
      targets: only === undefined ? prepared.targets : [prepared.targets[only]!],
      onExit: () => void goHome(),
      onFinish: (session) => {
        const change = record(session, only);
        renderFinish(root, config, session, {
          change,
          again: () => void practice(open, only),
          home: () => void goHome(),
          history: () => renderHistory(root, variant, VARIANT_NAMES[variant], () => void goHome()),
        });
      },
    });
  };

  await goHome();
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

void main();

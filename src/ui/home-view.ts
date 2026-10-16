// 首頁：開始練習（鏡頭或影片檔）、步驟一覽、設定摘要。
// （階段 4 會加入個人資料輸入）
import type { AppConfig, ResolvedStep } from '../config/load';
import { primeSpeech } from '../feedback/voice';
import logoUrl from '../assets/utaipei-logo.png';
import { configSummary } from './config-summary';
import { el } from './dom';

export interface HomeActions {
  onPractice(): Promise<void>;
  /** 只練某一步（從 0 開始的索引） */
  onPracticeStep(index: number): Promise<void>;
  onPracticeWithFile(file: File): Promise<void>;
  onCameraTest(): Promise<void>;
}

export interface HomeState {
  /** 標準動作資料還沒準備好的原因（null = 可以開始練習） */
  notReady: string[] | null;
  error?: string;
}

const TYPE_NAMES = { static: '靜態', dynamic: '動態', follow: '跟做' } as const;

function conditionText(step: ResolvedStep): string {
  if (step.type === 'static') return `維持 ${step.holdMs / 1000} 秒`;
  if (step.type === 'follow') return `跟著做 ${step.durationSec} 秒`;
  return `${step.reps} 次・${step.checkpoints.map((c) => c.name).join(' → ')}`;
}

export function renderHome(root: HTMLElement, config: AppConfig, state: HomeState, actions: HomeActions): void {
  const ready = state.notReady === null;
  const startButton = el('button', { class: 'primary big' }, '▶ 開始練習');
  const fileButton = el('button', { class: 'big' }, '🎞 用影片檔練習');
  const fileInput = el('input', { type: 'file', accept: 'video/*', hidden: '' });
  const testButton = el('button', {}, '📷 鏡頭與骨架測試');
  startButton.disabled = fileButton.disabled = !ready;

  const status = el(
    'div',
    { class: 'home-status' },
    state.error ? el('p', { class: 'error-banner' }, `⚠ ${state.error}`) : null,
    ...(state.notReady ?? []).map((m) => el('p', { class: 'error-banner' }, `⚠ ${m}`)),
    ready && !state.error ? el('p', { class: 'muted' }, '把手機橫放（或直放）在 2～3 公尺外，讓全身入鏡，然後按「開始練習」。') : null,
  );

  const busy = (text: string) => {
    for (const b of [startButton, fileButton, testButton]) b.disabled = true;
    for (const li of stepCards) (li.firstChild as HTMLButtonElement).disabled = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    status.replaceChildren(el('p', { class: 'muted' }, text));
  };
  startButton.addEventListener('click', () => {
    primeSpeech(); // iPhone 要在點擊當下先發聲一次，之後才能自動念提示
    busy('開啟鏡頭中…（瀏覽器詢問時請按「允許」）');
    void actions.onPractice();
  });
  testButton.addEventListener('click', () => {
    busy('開啟鏡頭中…（瀏覽器詢問時請按「允許」）');
    void actions.onCameraTest();
  });
  fileButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    primeSpeech();
    busy(`載入影片「${file.name}」中…`);
    void actions.onPracticeWithFile(file);
  });

  const steps = config.routine.steps;
  const stepCards = steps.map((s, i) => {
    const card = el(
      'button',
      { class: 'home-step', title: `單獨練習「${s.name}」` },
      el('span', { class: 'home-step-no' }, String(i + 1)),
      el(
        'div',
        { class: 'home-step-body' },
        el('div', { class: 'home-step-name' }, s.name, el('span', { class: `tag ${s.type}` }, TYPE_NAMES[s.type])),
        el('div', { class: 'muted' }, s.description ?? ''),
        el('div', { class: 'home-step-cond' }, conditionText(s)),
      ),
      el('span', { class: 'home-step-go' }, '▶ 單獨練習'),
    );
    card.disabled = !ready;
    card.addEventListener('click', () => {
      primeSpeech();
      busy(`開啟鏡頭中…（單獨練習「${s.name}」）`);
      void actions.onPracticeStep(i);
    });
    return el('li', {}, card);
  });
  root.replaceChildren(
    el(
      'main',
      { class: 'home' },
      el(
        'section',
        { class: 'home-hero' },
        el('img', { class: 'home-logo', src: logoUrl, alt: '臺北市立大學 University of Taipei' }),
        el('p', { class: 'home-kicker' }, '即時動作比對練習'),
        el('h1', {}, config.routine.name),
        el('p', { class: 'home-sub' }, `共 ${steps.length} 個動作・做對了才進下一步`),
        el('div', { class: 'actions' }, startButton, fileButton, fileInput),
        status,
      ),
      el('h2', { class: 'home-section-title' }, '動作列表', el('span', { class: 'muted' }, '　點任一動作可以單獨練習')),
      el('ol', { class: 'home-steps' }, ...stepCards),
      el(
        'details',
        { class: 'home-more' },
        el('summary', {}, '設定摘要與開發工具'),
        el(
          'div',
          { class: 'actions' },
          testButton,
          import.meta.env.DEV ? el('a', { href: './tools/reference.html', class: 'button-link' }, '🛠 標準動作建置工具') : null,
        ),
        configSummary(config),
      ),
    ),
  );
}

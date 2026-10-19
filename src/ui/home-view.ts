// 首頁：開始練習（鏡頭或影片檔）、步驟一覽、設定摘要。
// （階段 4 會加入個人資料輸入）
import type { AppConfig, ResolvedStep } from '../config/load';
import { getMusic } from '../feedback/music';
import { availableGenders, detectedVoices, getChosenGender, previewVoice, primeSpeech, setChosenGender, type VoiceGender } from '../feedback/voice';
import logoUrl from '../assets/utaipei-logo.png';
import { getChosenCameraId, listCameras, setChosenCameraId } from '../input/video-source';
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

/** 偵測到的語音清單：列出這個瀏覽器抓到的語音，並標出目前女聲／男聲用的是哪一個 */
function voiceDiagnostics(style: Parameters<typeof availableGenders>[0]): HTMLElement {
  const box = el('section', { class: 'voice-diag' }, el('h2', {}, '偵測到的語音清單'), el('p', { class: 'muted' }, '讀取中…'));
  void Promise.all([detectedVoices(), availableGenders(style)]).then(([voices, avail]) => {
    const zh = voices.filter((v) => v.lang.toLowerCase().startsWith('zh'));
    const tag = (name: string) => (name === avail.female ? '（目前的女聲）' : name === avail.male ? '（目前的男聲）' : '');
    box.replaceChildren(
      el('h2', {}, '偵測到的語音清單'),
      el(
        'p',
        { class: 'muted' },
        `這個瀏覽器共有 ${voices.length} 個語音，其中中文 ${zh.length} 個。` +
          `女聲：${avail.female ?? '沒有'}；男聲：${avail.male ?? '沒有'}。` +
          (avail.male ? '' : '沒有男聲時，可到 Mac「系統設定 → 輔助使用 → 朗讀內容 → 管理聲音」下載「中文（台灣）」男聲（例如 Reed、Eddy），再重新打開瀏覽器。'),
      ),
      zh.length
        ? el('ul', {}, ...zh.map((v) => el('li', {}, `${v.name}　${v.lang}${v.local ? '' : '（線上語音）'}`, el('b', {}, tag(v.name)))))
        : el('p', {}, '沒有偵測到任何中文語音。'),
      el('p', { class: 'muted' }, `中文以外的語音：${voices.length - zh.length} 個（未列出）`),
    );
  });
  return box;
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
    ready && !state.error
      ? el('p', { class: 'muted' }, '站到鏡頭前讓全身入鏡（筆電約 2 公尺、手機直放約 1.5 公尺），然後按「開始練習」。只動上半身的動作，拍到腰部以上即可。')
      : null,
  );

  const busy = (text: string) => {
    for (const b of [startButton, fileButton, testButton]) b.disabled = true;
    for (const li of stepCards) (li.firstChild as HTMLButtonElement).disabled = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    status.replaceChildren(el('p', { class: 'muted' }, text));
  };
  startButton.addEventListener('click', () => {
    primeSpeech();
      getMusic()?.start(); // 背景配樂也要在點擊當下開始 // iPhone 要在點擊當下先發聲一次，之後才能自動念提示
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
      getMusic()?.start(); // 背景配樂也要在點擊當下開始
    busy(`載入影片「${file.name}」中…`);
    void actions.onPracticeWithFile(file);
  });

  // 教練聲音：女聲／男聲二選一，可試聽（記在這台裝置上）
  const style = config.settings.voice;
  const genderButtons = {
    female: el('button', { class: 'voice-option' }, '女聲'),
    male: el('button', { class: 'voice-option' }, '男聲'),
  };
  const previewButton = el('button', { class: 'voice-preview' }, '▶ 試聽');
  const voiceNote = el('span', { class: 'voice-note' });
  const voiceRow = el(
    'div',
    { class: 'voice-row', hidden: '' },
    el('span', {}, '🔊 教練聲音'),
    el('span', { class: 'voice-options' }, genderButtons.female, genderButtons.male),
    previewButton,
    voiceNote,
  );
  const showGender = () => {
    const g = getChosenGender(style.defaultGender);
    for (const [k, b] of Object.entries(genderButtons)) b.classList.toggle('active', k === g);
  };
  void availableGenders(style).then((avail) => {
    if (!avail.female && !avail.male) return;
    genderButtons.male.disabled = !avail.male;
    genderButtons.female.disabled = !avail.female;
    if (!avail.male) voiceNote.textContent = '（這台裝置沒有男聲）';
    if (!avail.female) voiceNote.textContent = '（這台裝置沒有女聲）';
    voiceRow.hidden = false;
    showGender();
  });
  for (const [k, b] of Object.entries(genderButtons) as [VoiceGender, HTMLButtonElement][]) {
    b.addEventListener('click', () => {
      setChosenGender(k);
      showGender();
      previewVoice(style);
    });
  }
  previewButton.addEventListener('click', () => previewVoice(style));

  // 選擇鏡頭：例如外接廣角鏡頭、或用 iPhone 當網路攝影機（Mac 的「接續互通相機」），視野更廣、可以站近一點
  const cameraSelect = el('select', { class: 'camera-select', 'aria-label': '鏡頭' });
  const cameraNote = el('span', { class: 'voice-note' });
  const cameraRow = el('div', { class: 'voice-row', hidden: '' }, el('span', {}, '📷 鏡頭'), cameraSelect, cameraNote);
  void listCameras().then((cams) => {
    if (cams.length === 0) return;
    const chosen = getChosenCameraId();
    cameraSelect.replaceChildren(
      el('option', { value: '' }, '預設鏡頭'),
      ...cams.map((c, i) => {
        const o = el('option', { value: c.id }, c.label || `鏡頭 ${i + 1}`);
        if (c.id === chosen) o.selected = true;
        return o;
      }),
    );
    if (cams.every((c) => !c.label)) cameraNote.textContent = '（開過一次鏡頭後，這裡會顯示鏡頭名稱）';
    cameraRow.hidden = cams.length < 2 && cams.every((c) => !c.label);
  });
  cameraSelect.addEventListener('change', () => setChosenCameraId(cameraSelect.value || null));

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
      getMusic()?.start(); // 背景配樂也要在點擊當下開始
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
        voiceRow,
        cameraRow,
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
        voiceDiagnostics(style),
        configSummary(config),
      ),
    ),
  );
}

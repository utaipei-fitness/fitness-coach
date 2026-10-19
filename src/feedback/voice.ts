// 語音教練：用瀏覽器內建的語音合成（Web Speech API）念出提示，不需要外部軟體。
// 風格：像健身教練喊口令——短、有力，只講重點。
//   會講：步驟名稱、最需要修正的一項、「退後一點，全身入鏡」
//   不講：「很好／完成」、報數、念總分等多餘的話
// 規則重點是「不要一直講話」：錯誤要持續一下才提醒、提醒之間有間隔、同一句話不連續重複。
// 這裡不碰畫面；VoiceCoach 透過 Speaker 介面說話，方便測試。

export interface Speaker {
  /** interrupt = 先停掉正在講的話再講 */
  speak(text: string, interrupt: boolean): void;
  cancel(): void;
}

export interface VoiceOptions {
  /** 兩次「修正提醒」之間至少間隔幾毫秒 */
  correctionIntervalMs: number;
  /** 同一句修正提醒至少間隔幾毫秒才能再講 */
  repeatSameMs: number;
  /** 錯誤要持續多久（毫秒）才提醒（避免骨架抖一下就講話） */
  minPersistMs: number;
  /** 「退後一點，全身入鏡」至少間隔幾毫秒 */
  notVisibleIntervalMs: number;
}

/** 口令化：結尾加上驚嘆號，讓語音念起來比較有力 */
export function asCommand(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[！!？?。.]$/.test(t) ? t.replace(/[。.]$/, '！') : `${t}！`;
}

export class VoiceCoach {
  enabled = true;
  private quietUntil = 0;
  private lastCorrectionAt = -Infinity;
  private lastSpoken = new Map<string, number>();
  private pending: { text: string; since: number } | null = null;
  private lastNotVisibleAt = -Infinity;

  constructor(
    private readonly speaker: Speaker,
    private readonly opts: VoiceOptions,
  ) {}

  private say(text: string, t: number, interrupt = false): void {
    if (!this.enabled || !text) return;
    this.speaker.speak(asCommand(text), interrupt);
    this.lastSpoken.set(text, t);
    // 粗估講完需要的時間（中文約每字 0.25 秒），講話時不插入修正提醒
    this.quietUntil = Math.max(this.quietUntil, t + text.length * 250);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.speaker.cancel();
  }

  /** 進入新的一步：只喊動作名稱 */
  stepStart(name: string, t: number): void {
    this.pending = null;
    this.say(name, t, true);
  }

  notVisible(t: number): void {
    this.pending = null;
    if (t - this.lastNotVisibleAt < this.opts.notVisibleIntervalMs || t < this.quietUntil) return;
    this.lastNotVisibleAt = t;
    this.say('退後一點，全身入鏡', t);
  }

  /** 每次更新畫面時呼叫；text 為目前最需要修正的提示（沒有就傳空字串） */
  correction(text: string, t: number): void {
    if (!text) {
      this.pending = null;
      return;
    }
    if (!this.pending || this.pending.text !== text) this.pending = { text, since: t };
    const persisted = t - this.pending.since >= this.opts.minPersistMs;
    const spacedOut = t - this.lastCorrectionAt >= this.opts.correctionIntervalMs;
    const notRepeated = t - (this.lastSpoken.get(text) ?? -Infinity) >= this.opts.repeatSameMs;
    if (persisted && spacedOut && notRepeated && t >= this.quietUntil) {
      this.lastCorrectionAt = t;
      this.say(text, t);
    }
  }
}

// ───────────── 瀏覽器語音 ─────────────

export interface SpeechStyle {
  /** 語速（1 = 正常） */
  rate: number;
  /** 音調（1 = 正常，大於 1 比較高亢有活力） */
  pitch: number;
  /** 偏好的語音名稱（依序找第一個這台裝置有的），例如 ["美佳", "Eddy"] */
  preferredVoices: string[];
}

const VOICE_NAME_KEY = 'fitness-coach.voice-name';

/** 使用者在首頁選的語音（記在這台裝置上） */
export function getChosenVoiceName(): string | null {
  try {
    return localStorage.getItem(VOICE_NAME_KEY);
  } catch {
    return null;
  }
}

export function setChosenVoiceName(name: string | null): void {
  try {
    if (name) localStorage.setItem(VOICE_NAME_KEY, name);
    else localStorage.removeItem(VOICE_NAME_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 這台裝置上的中文語音（台灣優先）。語音清單有時要等一下才載入完 */
export function chineseVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([]);
  const pick = () =>
    speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('zh'))
      .sort((a, b) => Number(b.lang.toLowerCase().endsWith('tw')) - Number(a.lang.toLowerCase().endsWith('tw')));
  const now = pick();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(pick());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function pickVoice(style: SpeechStyle): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const chosen = getChosenVoiceName();
  const byName = (n: string) => voices.find((v) => v.name === n) ?? voices.find((v) => v.name.includes(n) && v.lang.toLowerCase().startsWith('zh'));
  return (
    (chosen ? byName(chosen) : undefined) ??
    style.preferredVoices.map(byName).find(Boolean) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === 'zh-tw') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('zh'))
  );
}

function makeUtterance(text: string, style: SpeechStyle): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-TW';
  u.rate = style.rate;
  u.pitch = style.pitch;
  const v = pickVoice(style);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  return u;
}

/**
 * 瀏覽器語音合成；不支援時回傳 null。
 * onTalking(true/false)：開始／結束說話時通知（用來在說話時把配樂調小聲）
 */
export function browserSpeaker(style: SpeechStyle, onTalking: (talking: boolean) => void = () => {}): Speaker | null {
  if (typeof speechSynthesis === 'undefined') return null;
  return {
    speak(text, interrupt) {
      if (interrupt) speechSynthesis.cancel();
      const u = makeUtterance(text, style);
      u.onstart = () => onTalking(true);
      u.onend = u.onerror = () => onTalking(speechSynthesis.speaking || speechSynthesis.pending);
      speechSynthesis.speak(u);
    },
    cancel() {
      speechSynthesis.cancel();
    },
  };
}

/** 試聽：用指定的語音念一句示範口令 */
export function previewVoice(style: SpeechStyle, text = '右手，再抬高！膝蓋，再彎一點！'): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  speechSynthesis.speak(makeUtterance(text, style));
}

/**
 * iPhone 規定第一次發聲要在使用者「點擊」的當下。
 * 在「開始練習」等按鈕的點擊事件裡呼叫一次（不出聲），之後才能自動念提示。
 */
export function primeSpeech(): void {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

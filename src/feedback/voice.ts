// 語音教練：用瀏覽器內建的語音合成（Web Speech API）念出提示，不需要外部軟體。
// 風格：自然、有活力，只講重點。可選女聲或男聲。
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
    this.speaker.speak(text, interrupt);
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
    this.say(NOT_VISIBLE_TEXT, t);
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

import { cloudVoiceName, voiceClipUrl, type VoiceGender } from './voice-assets';
import { NOT_VISIBLE_TEXT, PREVIEW_TEXT } from './voice-phrases';

export type { VoiceGender };

export interface SpeechStyle {
  /** 語速（1 = 正常） */
  rate: number;
  /** 音調（1 = 正常） */
  pitch: number;
  defaultGender: VoiceGender;
  /** 女聲／男聲的候選語音名稱（依序找這台裝置上有的，名稱包含即可） */
  femaleVoices: string[];
  maleVoices: string[];
}

const GENDER_KEY = 'fitness-coach.voice-gender';

/** 使用者在首頁選的聲音（女聲／男聲），記在這台裝置上 */
export function getChosenGender(fallback: VoiceGender): VoiceGender {
  try {
    const v = localStorage.getItem(GENDER_KEY);
    return v === 'male' || v === 'female' ? v : fallback;
  } catch {
    return fallback;
  }
}

export function setChosenGender(g: VoiceGender): void {
  try {
    localStorage.setItem(GENDER_KEY, g);
  } catch {
    /* 忽略 */
  }
}

function zhVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('zh'));
}

/** 依候選名單找這台裝置上的語音（台灣中文優先） */
function findVoice(candidates: string[]): SpeechSynthesisVoice | undefined {
  const voices = zhVoices().sort(
    (a, b) => Number(b.lang.toLowerCase().replace('_', '-') === 'zh-tw') - Number(a.lang.toLowerCase().replace('_', '-') === 'zh-tw'),
  );
  for (const name of candidates) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return undefined;
}

/** 這個瀏覽器偵測到的所有語音（排查「為什麼沒有男聲」用）；中文排前面 */
export function detectedVoices(): Promise<{ name: string; lang: string; local: boolean }[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([]);
  const list = () =>
    speechSynthesis
      .getVoices()
      .map((v) => ({ name: v.name, lang: v.lang, local: v.localService }))
      .sort((a, b) => Number(b.lang.toLowerCase().startsWith('zh')) - Number(a.lang.toLowerCase().startsWith('zh')) || a.lang.localeCompare(b.lang));
  if (speechSynthesis.getVoices().length) return Promise.resolve(list());
  return new Promise((resolve) => {
    const done = () => resolve(list());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

/**
 * 等語音清單載入完（有些瀏覽器要等一下），回傳女聲／男聲各用哪個聲音（沒有為 null）。
 * 有雲端音檔（npm run voices）的聲音一定可用，不受裝置影響。
 */
export function availableGenders(style: SpeechStyle): Promise<Record<VoiceGender, string | null>> {
  const check = () => ({
    female: cloudVoiceName('female') ?? (typeof speechSynthesis === 'undefined' ? null : (findVoice(style.femaleVoices)?.name ?? null)),
    male: cloudVoiceName('male') ?? (typeof speechSynthesis === 'undefined' ? null : (findVoice(style.maleVoices)?.name ?? null)),
  });
  if (typeof speechSynthesis === 'undefined' || zhVoices().length) return Promise.resolve(check());
  return new Promise((resolve) => {
    const done = () => resolve(check());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function pickVoice(style: SpeechStyle): SpeechSynthesisVoice | undefined {
  const g = getChosenGender(style.defaultGender);
  return (
    findVoice(g === 'male' ? style.maleVoices : style.femaleVoices) ??
    findVoice(g === 'male' ? style.femaleVoices : style.maleVoices) ??
    zhVoices().find((v) => v.lang.toLowerCase().replace('_', '-') === 'zh-tw') ??
    zhVoices()[0]
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

// 雲端音檔用同一個 <audio> 播放：iPhone 只要在點擊時「解鎖」過一次，之後就能自動播放
let clipAudio: HTMLAudioElement | null = null;
function getClipAudio(): HTMLAudioElement {
  clipAudio ??= new Audio();
  return clipAudio;
}

/**
 * 說話：有雲端音檔就播音檔，沒有就用裝置內建語音。不支援語音也沒有音檔時回傳 null。
 * onTalking(true/false)：開始／結束說話時通知（用來在說話時把配樂調小聲）
 */
export function browserSpeaker(style: SpeechStyle, onTalking: (talking: boolean) => void = () => {}): Speaker | null {
  const hasTts = typeof speechSynthesis !== 'undefined';
  const hasClips = cloudVoiceName('female') !== null || cloudVoiceName('male') !== null;
  if (!hasTts && !hasClips) return null;
  const queue: string[] = [];
  let clipPlaying = false;

  const playNext = (): void => {
    const url = queue.shift();
    if (!url) {
      clipPlaying = false;
      onTalking(false);
      return;
    }
    const audio = getClipAudio();
    clipPlaying = true;
    onTalking(true);
    audio.onended = audio.onerror = () => playNext();
    audio.src = url;
    void audio.play().catch(() => playNext());
  };

  return {
    speak(text, interrupt) {
      if (interrupt) this.cancel();
      const url = voiceClipUrl(getChosenGender(style.defaultGender), text);
      if (url) {
        queue.push(url);
        if (!clipPlaying) playNext();
        return;
      }
      if (!hasTts) return;
      const u = makeUtterance(text, style);
      u.onstart = () => onTalking(true);
      u.onend = u.onerror = () => onTalking(speechSynthesis.speaking || speechSynthesis.pending || clipPlaying);
      speechSynthesis.speak(u);
    },
    cancel() {
      queue.length = 0;
      if (clipAudio) {
        clipAudio.onended = clipAudio.onerror = null;
        clipAudio.pause();
      }
      clipPlaying = false;
      if (hasTts) speechSynthesis.cancel();
      onTalking(false);
    },
  };
}

/** 試聽：用目前選的聲音念一句示範提示 */
export function previewVoice(style: SpeechStyle, text = PREVIEW_TEXT): void {
  browserSpeaker(style)?.speak(text, true);
}

/**
 * iPhone 規定第一次發聲要在使用者「點擊」的當下。
 * 在「開始練習」等按鈕的點擊事件裡呼叫一次（不出聲），之後才能自動念提示、播放語音音檔。
 */
export function primeSpeech(): void {
  const audio = getClipAudio();
  audio.muted = true;
  void audio.play().catch(() => {}).finally(() => {
    audio.pause();
    audio.muted = false;
  });
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

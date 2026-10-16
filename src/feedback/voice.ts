// 語音教練：用瀏覽器內建的語音合成（Web Speech API）念出提示，不需要外部軟體。
// 規則重點是「不要一直講話」：同一個錯誤要持續一下才提醒、提醒之間有間隔、同一句話不連續重複。
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
  /** 「請讓全身入鏡」至少間隔幾毫秒 */
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

  stepStart(no: number, total: number, name: string, description: string | undefined, t: number): void {
    this.pending = null;
    this.say(`第${no}步，共${total}步。${name}。${description ?? ''}`, t, true);
  }

  passed(t: number): void {
    this.pending = null;
    this.say('很好，完成！', t, true);
  }

  rep(count: number, t: number): void {
    this.say(`${count}`, t, true);
  }

  holdStart(t: number): void {
    if (t >= this.quietUntil) this.say('很好，保持住', t);
  }

  notVisible(t: number): void {
    this.pending = null;
    if (t - this.lastNotVisibleAt < this.opts.notVisibleIntervalMs || t < this.quietUntil) return;
    this.lastNotVisibleAt = t;
    this.say('請退後一點，讓全身入鏡', t);
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

  /** 直接念一段話（例如練習結束時報總分） */
  announce(text: string, t: number): void {
    this.say(text, t, true);
  }
}

// ───────────── 瀏覽器語音 ─────────────

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'zh-TW') ??
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'zh-tw') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('zh'))
  );
}

/** 瀏覽器語音合成；不支援時回傳 null */
export function browserSpeaker(rate: number): Speaker | null {
  if (typeof speechSynthesis === 'undefined') return null;
  return {
    speak(text, interrupt) {
      if (interrupt) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      u.rate = rate;
      const v = pickVoice();
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    },
    cancel() {
      speechSynthesis.cancel();
    },
  };
}

/**
 * iPhone 規定第一次發聲要在使用者「點擊」的當下。
 * 在「開始練習」等按鈕的點擊事件裡呼叫一次，之後才能自動念提示。
 */
export function primeSpeech(text = '準備開始'): void {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-TW';
  speechSynthesis.speak(u);
}

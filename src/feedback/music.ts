// 背景配樂：練習時循環播放標準影片的配樂；語音提示說話時自動調小聲（ducking），講完恢復。
// 注意：
//   - iPhone 規定聲音要在「點擊」的當下開始，所以要在開始按鈕的點擊事件裡呼叫 music.start()。
//   - iPhone 的 Safari 不能直接改 <audio> 的音量，所以用 Web Audio 的音量節點（GainNode）控制。
import type { Settings } from '../config/schema';

type MusicSettings = Settings['music'];

/** 目前應該是多大聲（純函式，方便測試） */
export function musicVolume(enabled: boolean, talking: boolean, s: MusicSettings): number {
  if (!enabled) return 0;
  return talking ? Math.min(s.duckVolume, s.volume) : s.volume;
}

const FADE_SEC = 0.35;
/** 保險：瀏覽器有時不會通知「講完了」，配樂最多只調小聲這麼久 */
const MAX_DUCK_MS = 8000;

export class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private talking = false;
  private playing = false;
  private duckTimer = 0;
  enabled: boolean;

  constructor(
    private readonly url: string | null,
    private readonly settings: MusicSettings,
    enabled: boolean,
  ) {
    this.enabled = enabled && url !== null;
  }

  get available(): boolean {
    return this.url !== null;
  }

  /** 開始播放（要在使用者點擊的當下呼叫） */
  start(): void {
    if (!this.url || !this.enabled) return;
    if (!this.audio) {
      this.audio = new Audio(this.url);
      this.audio.loop = true;
      this.audio.preload = 'auto';
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        try {
          this.ctx = new Ctx();
          this.gain = this.ctx.createGain();
          this.gain.gain.value = 0;
          this.ctx.createMediaElementSource(this.audio).connect(this.gain).connect(this.ctx.destination);
        } catch {
          this.ctx = null;
          this.gain = null;
        }
      }
    }
    void this.ctx?.resume();
    void this.audio.play().catch(() => {});
    this.playing = true;
    this.apply();
  }

  /** 語音開始／結束說話 */
  setTalking(talking: boolean): void {
    this.talking = talking;
    window.clearTimeout(this.duckTimer);
    if (talking) this.duckTimer = window.setTimeout(() => this.setTalking(false), MAX_DUCK_MS);
    this.apply();
  }

  /** 開／關配樂（按鈕點擊時呼叫，所以可以直接開始播放） */
  setEnabled(on: boolean): void {
    this.enabled = on && this.url !== null;
    if (this.enabled && !this.playing) this.start();
    this.apply();
  }

  /** 練習結束：淡出後停止，下次從頭播放 */
  stop(): void {
    this.playing = false;
    this.apply();
    const audio = this.audio;
    window.setTimeout(() => {
      if (!this.playing && audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    }, FADE_SEC * 1000 + 100);
  }

  private apply(): void {
    const v = this.playing ? musicVolume(this.enabled, this.talking, this.settings) : 0;
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(v, now + FADE_SEC);
    } else if (this.audio) {
      this.audio.volume = v;
    }
  }
}

const MUSIC_KEY = 'fitness-coach.music';

/** 這台裝置上次選的「配樂開／關」；沒選過就用設定檔的預設值 */
export function loadMusicOn(fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(MUSIC_KEY);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function saveMusicOn(on: boolean): void {
  try {
    localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  } catch {
    /* 忽略 */
  }
}

// 整個網頁共用一個播放器：首頁按鈕點擊時開始，練習畫面再控制它
let shared: MusicPlayer | null = null;

export function setupMusic(url: string | null, s: MusicSettings, enabled: boolean): MusicPlayer {
  shared ??= new MusicPlayer(url, s, enabled);
  return shared;
}

export function getMusic(): MusicPlayer | null {
  return shared;
}

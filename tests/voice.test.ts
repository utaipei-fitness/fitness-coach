// 語音教練的測試：確認「不會一直講話」的規則
import { describe, expect, it } from 'vitest';
import { VoiceCoach, type Speaker } from '../src/feedback/voice';

const opts = { correctionIntervalMs: 3000, repeatSameMs: 6000, minPersistMs: 800, notVisibleIntervalMs: 6000 };

function setup() {
  const said: string[] = [];
  const speaker: Speaker = { speak: (t) => said.push(t), cancel: () => {} };
  return { said, coach: new VoiceCoach(speaker, opts) };
}

/** 每 100 毫秒呼叫一次 correction，持續 ms 毫秒 */
function hold(coach: VoiceCoach, text: string, from: number, ms: number) {
  for (let t = from; t <= from + ms; t += 100) coach.correction(text, t);
}

describe('語音教練', () => {
  it('錯誤要持續 0.8 秒才提醒', () => {
    const { said, coach } = setup();
    hold(coach, '右手再抬高', 0, 500);
    expect(said).toEqual([]);
    hold(coach, '右手再抬高', 600, 300);
    expect(said).toEqual(['右手再抬高']);
  });

  it('同一句話 6 秒內不重複', () => {
    const { said, coach } = setup();
    hold(coach, '右手再抬高', 0, 6700); // 第一次在 0.8 秒講出，6.8 秒前不會再講
    expect(said).toEqual(['右手再抬高']);
    hold(coach, '右手再抬高', 6800, 100);
    expect(said).toEqual(['右手再抬高', '右手再抬高']);
  });

  it('兩次提醒至少間隔 3 秒', () => {
    const { said, coach } = setup();
    hold(coach, '右手再抬高', 0, 900);
    hold(coach, '左手再抬高', 1000, 2700); // 第一次在 0.8 秒講出，3.8 秒前不會講下一句
    expect(said).toEqual(['右手再抬高']);
    hold(coach, '左手再抬高', 3800, 100);
    expect(said).toEqual(['右手再抬高', '左手再抬高']);
  });

  it('動作做對了（沒有提示）就不講話', () => {
    const { said, coach } = setup();
    hold(coach, '', 0, 5000);
    expect(said).toEqual([]);
  });

  it('念步驟名稱的時候不插入修正提醒', () => {
    const { said, coach } = setup();
    coach.stepStart(2, 17, '原地踏步', '原地踏步，手臂自然前後擺動', 0);
    hold(coach, '右手再抬高', 0, 2000);
    expect(said).toHaveLength(1);
  });

  it('關掉語音就完全不講話', () => {
    const { said, coach } = setup();
    coach.setEnabled(false);
    coach.passed(0);
    coach.notVisible(0);
    hold(coach, '右手再抬高', 0, 5000);
    expect(said).toEqual([]);
  });

  it('「請讓全身入鏡」每 6 秒最多一次', () => {
    const { said, coach } = setup();
    for (let t = 0; t <= 7000; t += 100) coach.notVisible(t);
    expect(said.filter((x) => x.includes('入鏡'))).toHaveLength(2);
  });
});

describe('背景配樂音量', () => {
  const s = { enabled: true, volume: 0.35, duckVolume: 0.1 };
  it('平常用設定的音量，說話時降低，關閉時為 0', async () => {
    const { musicVolume } = await import('../src/feedback/music');
    expect(musicVolume(true, false, s)).toBe(0.35);
    expect(musicVolume(true, true, s)).toBe(0.1);
    expect(musicVolume(false, false, s)).toBe(0);
  });
});

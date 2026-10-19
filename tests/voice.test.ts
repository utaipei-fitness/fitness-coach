// 語音教練的測試：只講重點、口令式、不會一直講話
import { describe, expect, it } from 'vitest';
import { musicVolume } from '../src/feedback/music';
import { asCommand, VoiceCoach, type Speaker } from '../src/feedback/voice';

const opts = { correctionIntervalMs: 5000, repeatSameMs: 10000, minPersistMs: 1500, notVisibleIntervalMs: 10000 };

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
  it('進入新的一步只喊動作名稱（口令式）', () => {
    const { said, coach } = setup();
    coach.stepStart('深蹲', 0);
    expect(said).toEqual(['深蹲！']);
  });

  it('口令化：結尾加驚嘆號，句號換成驚嘆號', () => {
    expect(asCommand('右手再抬高')).toBe('右手再抬高！');
    expect(asCommand('右手再抬高。')).toBe('右手再抬高！');
    expect(asCommand('準備好了嗎？')).toBe('準備好了嗎？');
  });

  it('錯誤要持續 1.5 秒才提醒', () => {
    const { said, coach } = setup();
    hold(coach, '右手再抬高', 0, 1300);
    expect(said).toEqual([]);
    hold(coach, '右手再抬高', 1400, 200);
    expect(said).toEqual(['右手再抬高！']);
  });

  it('同一句話 10 秒內不重複', () => {
    const { said, coach } = setup();
    hold(coach, '右手再抬高', 0, 11400); // 第一次在 1.5 秒講出，11.5 秒前不會再講
    expect(said).toEqual(['右手再抬高！']);
    hold(coach, '右手再抬高', 11500, 100);
    expect(said).toEqual(['右手再抬高！', '右手再抬高！']);
  });

  it('兩次提醒至少間隔 5 秒', () => {
    const { said, coach } = setup();
    hold(coach, '右手再抬高', 0, 1500);
    hold(coach, '左手再抬高', 1600, 4800); // 第一次在 1.5 秒講出，6.5 秒前不會講下一句
    expect(said).toEqual(['右手再抬高！']);
    hold(coach, '左手再抬高', 6500, 100);
    expect(said).toEqual(['右手再抬高！', '左手再抬高！']);
  });

  it('動作做對了（沒有提示）就不講話', () => {
    const { said, coach } = setup();
    hold(coach, '', 0, 20000);
    expect(said).toEqual([]);
  });

  it('念動作名稱的時候不插入修正提醒', () => {
    const { said, coach } = setup();
    coach.stepStart('側蹲＋後跨步（左）', 0);
    hold(coach, '右手再抬高', 0, 2200); // 名稱 9 個字，約 2.25 秒講完
    expect(said).toHaveLength(1);
  });

  it('關掉語音就完全不講話', () => {
    const { said, coach } = setup();
    coach.setEnabled(false);
    coach.stepStart('深蹲', 0);
    coach.notVisible(0);
    hold(coach, '右手再抬高', 0, 5000);
    expect(said).toEqual([]);
  });

  it('「退後一點，全身入鏡」每 10 秒最多一次', () => {
    const { said, coach } = setup();
    for (let t = 0; t <= 15000; t += 100) coach.notVisible(t);
    expect(said).toEqual(['退後一點，全身入鏡！', '退後一點，全身入鏡！']);
  });
});

describe('背景配樂音量', () => {
  const s = { enabled: true, volume: 0.35, duckVolume: 0.1 };
  it('平常用設定的音量，說話時降低，關閉時為 0', () => {
    expect(musicVolume(true, false, s)).toBe(0.35);
    expect(musicVolume(true, true, s)).toBe(0.1);
    expect(musicVolume(false, false, s)).toBe(0);
  });
});

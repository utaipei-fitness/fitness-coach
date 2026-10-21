// 自選影片跟練的比對與計分（不碰畫面，可單獨測試）。
// 每一刻：拿使用者的姿勢，和示範影片「目前時間往前 lagSec 秒～往後 leadSec 秒」內最像的那一幀比對，
// 所以跟著做慢半拍不會被扣分。分數用和整套練習相同的 angleScore（settings.json 的 scoring）。
import { angleDiff, angleValue } from '../angles/compute';
import type { AngleDef, Settings } from '../config/schema';
import type { PoseFrame } from '../pose/types';
import type { ReferenceData } from '../reference/reference-data';
import { angleScore } from '../report/score';

export interface FollowCheck {
  id: string;
  name: string;
  /** 使用者角度 − 示範角度 */
  diff: number;
  ok: boolean;
}

export interface FollowMoment {
  /** 這一刻的分數 0～100；看不到人或沒有可比的角度時為 null */
  score: number | null;
  /** 和哪個示範時間點比對（秒） */
  matchedAt: number | null;
  checks: FollowCheck[];
  /** 偏差最大、且超出容許角度的一項 */
  worst: FollowCheck | null;
}

export interface FollowSegment {
  start: number;
  end: number;
  /** 這一段的平均分數；看得到人的比例太低時為 null */
  score: number | null;
}

export interface FollowSummary {
  /** 總分 0～100（有計分的時段平均）；完全沒有資料時為 null */
  score: number | null;
  segments: FollowSegment[];
  /** 各部位：平均偏差（度）與「最常偏差」的次數，偏差大的排前面 */
  parts: { id: string; name: string; avgDiff: number; worstCount: number }[];
  /** 有計分的時間比例 0～1 */
  coverage: number;
}

export interface FollowScorerOptions {
  follow: Settings['follow'];
  scoring: Settings['scoring'];
  angles: Record<string, AngleDef>;
  minVisibility: number;
}

/** 至少要有幾個角度能比對，才算一次有效比對 */
const MIN_COMMON_ANGLES = 2;

export class FollowScorer {
  /** 每一幀示範姿勢的各角度（預先算好，比對時就不用重算） */
  private readonly refAngles: (Record<string, number> | null)[];
  private readonly ids: string[];
  private samples: { t: number; score: number | null }[] = [];
  private partStats = new Map<string, { sumAbs: number; n: number; worst: number }>();

  constructor(
    private readonly ref: ReferenceData,
    private readonly opts: FollowScorerOptions,
  ) {
    this.ids = opts.follow.angles.filter((id) => id in opts.angles);
    this.refAngles = ref.frames.map((f) => (f ? this.anglesOf(f) : null));
  }

  private anglesOf(frame: PoseFrame): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of this.ids) {
      const v = angleValue(this.opts.angles[id]!, frame, this.opts.minVisibility);
      if (v !== null) out[id] = v;
    }
    return out;
  }

  /** 比對一刻。user = null 表示看不到人。videoT = 示範影片目前播放到第幾秒 */
  evaluate(user: PoseFrame | null, videoT: number): FollowMoment {
    const empty: FollowMoment = { score: null, matchedAt: null, checks: [], worst: null };
    if (!user) return empty;
    const mine = this.anglesOf(user);
    const { fps } = this.ref.file;
    const { lagSec, leadSec, toleranceDeg } = this.opts.follow;
    const from = Math.max(0, Math.floor((videoT - lagSec) * fps));
    const to = Math.min(this.refAngles.length - 1, Math.ceil((videoT + leadSec) * fps));

    let best: { i: number; err: number } | null = null;
    for (let i = from; i <= to; i++) {
      const r = this.refAngles[i];
      if (!r) continue;
      let sum = 0;
      let n = 0;
      for (const id of this.ids) {
        if (r[id] === undefined || mine[id] === undefined) continue;
        sum += Math.abs(angleDiff(mine[id]!, r[id]!));
        n++;
      }
      if (n < MIN_COMMON_ANGLES) continue;
      const err = sum / n;
      if (!best || err < best.err) best = { i, err };
    }
    if (!best) return empty;

    const r = this.refAngles[best.i]!;
    const checks: FollowCheck[] = this.ids
      .filter((id) => r[id] !== undefined && mine[id] !== undefined)
      .map((id) => {
        const diff = angleDiff(mine[id]!, r[id]!);
        return { id, name: this.opts.angles[id]!.name, diff, ok: Math.abs(diff) <= toleranceDeg };
      });
    const score = checks.reduce((s, c) => s + angleScore(Math.abs(c.diff) / toleranceDeg, this.opts.scoring), 0) / checks.length;
    const worst = checks.filter((c) => !c.ok).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0] ?? null;
    return { score, matchedAt: best.i / fps, checks, worst };
  }

  /** 把這一刻記進成績（每一幀呼叫） */
  record(m: FollowMoment, videoT: number): void {
    this.samples.push({ t: videoT, score: m.score });
    for (const c of m.checks) {
      const s = this.partStats.get(c.id) ?? { sumAbs: 0, n: 0, worst: 0 };
      s.sumAbs += Math.abs(c.diff);
      s.n++;
      if (m.worst?.id === c.id) s.worst++;
      this.partStats.set(c.id, s);
    }
  }

  summary(durationSec: number): FollowSummary {
    const { segmentSec, minCoverage } = this.opts.follow;
    const segments: FollowSegment[] = [];
    for (let start = 0; start < durationSec; start += segmentSec) {
      const end = Math.min(start + segmentSec, durationSec);
      const inSeg = this.samples.filter((x) => x.t >= start && x.t < end);
      const scored = inSeg.filter((x) => x.score !== null);
      const enough = inSeg.length > 0 && scored.length / inSeg.length >= minCoverage;
      segments.push({ start, end, score: enough ? Math.round(mean(scored.map((x) => x.score!))) : null });
    }
    const valid = segments.filter((s) => s.score !== null);
    const parts = [...this.partStats.entries()]
      .map(([id, s]) => ({ id, name: this.opts.angles[id]!.name, avgDiff: Math.round(s.sumAbs / s.n), worstCount: s.worst }))
      .sort((a, b) => b.worstCount - a.worstCount || b.avgDiff - a.avgDiff);
    const scoredSamples = this.samples.filter((x) => x.score !== null).length;
    return {
      score: valid.length ? Math.round(mean(valid.map((s) => s.score!))) : null,
      segments,
      parts,
      coverage: this.samples.length ? scoredSamples / this.samples.length : 0,
    };
  }
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

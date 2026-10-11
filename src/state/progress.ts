import type { Grade, Route } from '../game/types';
import { GRADES, gradeIndex } from '../game/types';
import type { Beta } from '../game/attempt';
import type { ScoreCard } from '../game/scoring';
import type { DailyState } from '../game/daily';
import type { TreadRun } from '../game/tread';

/**
 * What the player keeps.
 *
 * Sends, projects, personal bests and the highest grade they have actually
 * pulled off. Grades are not unlocked by playing — they open when you send
 * something at the grade below, which is roughly how it works outside.
 */

export const SAVE_VERSION = 1;

export type RouteRecord = {
  routeId: string;
  attempts: number;
  falls: number;
  sent: boolean;
  /** True when the first ever attempt was topped without falling. */
  onsighted: boolean;
  /** Furthest move index reached, for the project card. */
  bestMove: number;
  best: ScoreCard | null;
  beta: Beta | null;
  /** Player pinned this as something they are working. */
  project: boolean;
  lastPlayed: number;
  /**
   * The most points any send of this route has been worth. Points are banked
   * against this, not against the efficiency best, so a new best can never
   * take points away. Missing on older saves: read as `best.points`.
   */
  bestPoints?: number;
};

export type Profile = {
  version: number;
  createdAt: number;
  records: Record<string, RouteRecord>;
  /** Highest grade with at least one send. Null before the first send. */
  topGrade: Grade | null;
  /** Grades the player has been shown the breakthrough screen for. */
  celebrated: Grade[];
  daily: DailyState | null;
  totalSends: number;
  totalFalls: number;
  points: number;
  /** Dynos actually stuck. */
  totalDynos: number;
  /** The tread wall: every recent run, and the best per program. */
  tread: TreadRecord;
  /** Highball falls that ended off the pads or heavier than the pads were for. */
  heavyLandings: number;
  /**
   * The route setter's points, banked per difficulty: the most a send at that
   * difficulty has been worth. Rerolling sets a new route, not new points —
   * only beating your best at a difficulty adds any. Missing on older saves.
   */
  setterBest?: Record<string, number>;
};

export type TreadRecord = {
  /** Best run per program id, by time on the wall. */
  best: Record<string, TreadRun>;
  /** The most recent runs, newest first. */
  runs: TreadRun[];
};

/** How many runs the tread record keeps. */
export const TREAD_HISTORY = 40;
/** How many route-setter routes keep a record; the oldest go first. Board routes are never pruned. */
export const SETTER_RECORDS = 60;

export function freshProfile(now = Date.now()): Profile {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    records: {},
    topGrade: null,
    celebrated: [],
    daily: null,
    totalSends: 0,
    totalFalls: 0,
    points: 0,
    totalDynos: 0,
    tread: { best: {}, runs: [] },
    heavyLandings: 0,
  };
}

/**
 * Folds a tread wall run into the profile. Time on the wall is the score;
 * runs on different programs are never compared.
 */
export function recordTreadRun(profile: Profile, run: TreadRun): { profile: Profile; isBest: boolean; previous: TreadRun | null } {
  const tread = profile.tread ?? { best: {}, runs: [] };
  const previous = tread.best[run.program] ?? null;
  const isBest = !previous || run.time > previous.time;
  return {
    profile: {
      ...profile,
      tread: {
        best: isBest ? { ...tread.best, [run.program]: run } : tread.best,
        runs: [run, ...tread.runs].slice(0, TREAD_HISTORY),
      },
    },
    isBest,
    previous,
  };
}

/** The local leaderboard for a program: best runs first, same rules for all of them. */
export function treadBoard(profile: Profile, program: string, n = 5): TreadRun[] {
  const runs = (profile.tread?.runs ?? []).filter((r) => r.program === program);
  const best = profile.tread?.best[program];
  const all = best && !runs.some((r) => r.at === best.at) ? [best, ...runs] : runs;
  return [...all].sort((a, b) => b.time - a.time).slice(0, n);
}

/** How many routes the player has onsighted. */
export function onsightCount(profile: Profile): number {
  return Object.values(profile.records).filter((r) => r.onsighted).length;
}

export function recordFor(profile: Profile, routeId: string): RouteRecord {
  return profile.records[routeId] ?? {
    routeId, attempts: 0, falls: 0, sent: false, onsighted: false,
    bestMove: 0, best: null, beta: null, project: false, lastPlayed: 0,
  };
}

/** An onsight is only available while the route has never been attempted. */
export function onsightAvailable(profile: Profile, routeId: string): boolean {
  return recordFor(profile, routeId).attempts === 0;
}

/**
 * Which grades the player can see. Everything up to their top grade plus one,
 * so there is always exactly one rung above them to stare at.
 */
export function unlockedGrades(profile: Profile): Grade[] {
  const top = profile.topGrade ? gradeIndex(profile.topGrade) : -1;
  return GRADES.slice(0, Math.min(GRADES.length, top + 2));
}

export function isUnlocked(profile: Profile, grade: Grade): boolean {
  return unlockedGrades(profile).includes(grade);
}

export type Breakthrough = { grade: Grade; previous: Grade | null };

/** The points a route's sends have banked so far. */
export function bankedPoints(rec: RouteRecord): number {
  return rec.bestPoints ?? rec.best?.points ?? 0;
}

/**
 * Whether a send of this route can move the player's grade. Only board
 * routes do — not the setter's (you can reroll those until one suits you),
 * not highballs (their own tick list) — and only at a grade the board has
 * open: one rung above your top. A route reached some other way (the daily
 * draws from V1 to V5 whatever you have sent) is a great send, scored and
 * remembered, but it does not skip the rungs in between.
 */
export function sendCountsForGrade(profile: Profile, route: Route): boolean {
  return !route.blueprint && route.wall !== 'tower' && isUnlocked(profile, route.grade);
}

/** Folds a completed attempt into the profile. */
export function applySend(
  profile: Profile,
  route: Route,
  card: ScoreCard,
  beta: Beta,
): { profile: Profile; breakthrough: Breakthrough | null } {
  const prev = recordFor(profile, route.id);
  const better = !prev.best || card.efficiency > prev.best.efficiency;
  const banked = bankedPoints(prev);

  const record: RouteRecord = {
    ...prev,
    routeId: route.id,
    attempts: prev.attempts + 1,
    sent: true,
    onsighted: prev.onsighted || (card.onsight && prev.attempts === 0),
    bestMove: Math.max(prev.bestMove, card.moves),
    best: better ? card : prev.best,
    beta: better || !prev.beta ? beta : prev.beta,
    // Sending it retires it as a project.
    project: false,
    lastPlayed: card.sentAt,
    bestPoints: Math.max(banked, card.points),
  };

  const prevTop = profile.topGrade;
  const counts = sendCountsForGrade(profile, route);
  const raised = counts && (prevTop === null || gradeIndex(route.grade) > gradeIndex(prevTop));
  const topGrade = raised ? route.grade : prevTop;

  // Points only ever go up. A board route banks the most any of its sends
  // was worth. A setter route banks against the best at its difficulty, so
  // rerolling for fresh routes is for climbing, not for farming points.
  let gained = Math.max(0, card.points - banked);
  let setterBest = profile.setterBest;
  if (route.blueprint) {
    const tier = route.blueprint.difficulty;
    const tierBest = profile.setterBest?.[tier] ?? 0;
    gained = Math.max(0, card.points - tierBest);
    setterBest = { ...(profile.setterBest ?? {}), [tier]: Math.max(tierBest, card.points) };
  }

  let records = { ...profile.records, [route.id]: record };
  if (route.blueprint) records = pruneSetterRecords(records);

  const next: Profile = {
    ...profile,
    records,
    topGrade,
    totalSends: profile.totalSends + 1,
    points: profile.points + gained,
    ...(setterBest ? { setterBest } : {}),
  };

  const breakthrough =
    raised && !profile.celebrated.includes(route.grade)
      ? { grade: route.grade, previous: prevTop }
      : null;

  return { profile: next, breakthrough };
}

/** Keeps the newest SETTER_RECORDS route-setter records; board records are all kept. */
function pruneSetterRecords(records: Record<string, RouteRecord>): Record<string, RouteRecord> {
  const setter = Object.values(records).filter((r) => isSetterId(r.routeId));
  if (setter.length <= SETTER_RECORDS) return records;
  const drop = new Set(
    setter.sort((a, b) => b.lastPlayed - a.lastPlayed).slice(SETTER_RECORDS).filter((r) => !r.project).map((r) => r.routeId),
  );
  const out: Record<string, RouteRecord> = {};
  for (const [id, r] of Object.entries(records)) if (!drop.has(id)) out[id] = r;
  return out;
}

/** Route-setter ids start with `gen-`. */
export function isSetterId(id: string): boolean {
  return id.startsWith('gen-');
}

/**
 * Makes a loaded save safe to read: every field there with the right shape,
 * whatever an older version, a hand-edit or a half-written save left. Keeps
 * everything that is valid; fills in only what is missing or broken.
 */
export function normalizeProfile(raw: Partial<Profile>, now = Date.now()): Profile {
  const base = freshProfile(now);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const records: Record<string, RouteRecord> = {};
  if (raw.records && typeof raw.records === 'object') {
    for (const [id, r] of Object.entries(raw.records)) {
      if (r && typeof r === 'object') records[id] = { ...recordFor(base, id), ...r, routeId: id };
    }
  }
  const tread = raw.tread && typeof raw.tread === 'object' ? raw.tread : base.tread;
  return {
    ...base,
    ...raw,
    version: SAVE_VERSION,
    createdAt: num(raw.createdAt, base.createdAt),
    records,
    topGrade: raw.topGrade && (GRADES as readonly string[]).includes(raw.topGrade) ? raw.topGrade : null,
    celebrated: Array.isArray(raw.celebrated) ? raw.celebrated : [],
    daily: raw.daily && typeof raw.daily === 'object' ? raw.daily : null,
    totalSends: num(raw.totalSends, 0),
    totalFalls: num(raw.totalFalls, 0),
    points: num(raw.points, 0),
    totalDynos: num(raw.totalDynos, 0),
    tread: {
      best: tread.best && typeof tread.best === 'object' ? tread.best : {},
      runs: Array.isArray(tread.runs) ? tread.runs : [],
    },
    heavyLandings: num(raw.heavyLandings, 0),
    setterBest: raw.setterBest && typeof raw.setterBest === 'object' ? raw.setterBest : {},
  };
}

/** Folds a failed attempt in. Falls are worth keeping — they are the project. */
export function applyFall(profile: Profile, route: Route, movesReached: number, now = Date.now()): Profile {
  const prev = recordFor(profile, route.id);
  const record: RouteRecord = {
    ...prev,
    routeId: route.id,
    attempts: prev.attempts + 1,
    falls: prev.falls + 1,
    bestMove: Math.max(prev.bestMove, movesReached),
    lastPlayed: now,
  };
  return {
    ...profile,
    records: { ...profile.records, [route.id]: record },
    totalFalls: profile.totalFalls + 1,
  };
}

export function markCelebrated(profile: Profile, grade: Grade): Profile {
  if (profile.celebrated.includes(grade)) return profile;
  return { ...profile, celebrated: [...profile.celebrated, grade] };
}

export function toggleProject(profile: Profile, routeId: string): Profile {
  const prev = recordFor(profile, routeId);
  return {
    ...profile,
    records: { ...profile.records, [routeId]: { ...prev, project: !prev.project } },
  };
}

/** Status line for a project card. Deadpan on purpose. */
export function projectStatus(record: RouteRecord, par: number): string {
  if (record.sent) return 'SENT';
  if (record.attempts === 0) return 'UNTOUCHED';
  const frac = record.bestMove / Math.max(par, 1);
  if (frac > 0.85) return 'SO CLOSE';
  if (frac > 0.6) return 'GETTING THERE';
  if (record.attempts > 12) return 'PERSONAL';
  if (record.attempts > 5) return 'ONGOING';
  return 'EARLY DAYS';
}

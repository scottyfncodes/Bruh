import { describe, expect, it } from 'vitest';
import type { Route } from '../game/types';
import type { ScoreCard } from '../game/scoring';
import { ROUTES } from '../content/routes';
import {
  SETTER_RECORDS, applySend, bankedPoints, freshProfile, normalizeProfile, recordFor, sendCountsForGrade,
} from './progress';
import { DAILY_ATTEMPTS, attemptsRemaining, canAttemptDaily, freshDaily, recordDailyAttempt } from '../game/daily';

const byGrade = (g: string) => ROUTES.find((r) => r.grade === g)!;

function card(route: Route, over: Partial<ScoreCard> = {}): ScoreCard {
  return {
    routeId: route.id, grade: route.grade, moves: 10, par: route.par, falls: 0, perfect: 10, good: 0,
    scrape: 0, whiffed: 0, timeMs: 30000, efficiency: 0.8, points: 100, onsight: false, sentAt: 1000, ...over,
  };
}

/** A route-setter route, as the generator builds them: a blueprint, and an id starting gen-. */
function setterRoute(difficulty: string, n: number): Route {
  const base = byGrade('V2');
  return { ...base, id: `gen-${difficulty}-${n.toString(36)}-0-p20`, blueprint: { difficulty, sections: [], cruxes: [], relax: 0 } } as Route;
}

describe('the daily climb', () => {
  it('allows three attempts and no more', () => {
    let d = freshDaily('2026-10-11');
    for (let i = 0; i < DAILY_ATTEMPTS; i++) {
      expect(canAttemptDaily(d)).toBe(true);
      d = recordDailyAttempt(d, { sent: false });
    }
    expect(attemptsRemaining(d)).toBe(0);
    expect(canAttemptDaily(d)).toBe(false);
    // An attempt past the limit changes nothing.
    const after = recordDailyAttempt(d, { sent: true, moves: 9, efficiency: 0.9 });
    expect(after).toEqual(d);
    expect(after.sent).toBe(false);
  });

  it('a send spends an attempt and keeps the best', () => {
    let d = freshDaily('2026-10-11');
    d = recordDailyAttempt(d, { sent: true, moves: 14, efficiency: 0.6 });
    d = recordDailyAttempt(d, { sent: true, moves: 11, efficiency: 0.7 });
    expect(d.attemptsUsed).toBe(2);
    expect(d.sent).toBe(true);
    expect(d.bestMoves).toBe(11);
    expect(d.bestEfficiency).toBe(0.7);
    expect(d.onsightAvailable).toBe(false);
  });
});

describe('grades only move on routes the board has open', () => {
  it('a new player sending a V5 (say, the daily) does not jump to V5', () => {
    const p = freshProfile();
    const v5 = byGrade('V5');
    expect(sendCountsForGrade(p, v5)).toBe(false);
    const { profile, breakthrough } = applySend(p, v5, card(v5), []);
    expect(profile.topGrade).toBeNull();
    expect(breakthrough).toBeNull();
    // It is still a send, scored and remembered.
    expect(profile.totalSends).toBe(1);
    expect(recordFor(profile, v5.id).sent).toBe(true);
    expect(profile.points).toBe(100);
  });

  it('a send one rung up still counts, the way it always has', () => {
    const p = { ...freshProfile(), topGrade: 'V1' as const };
    const v2 = byGrade('V2');
    expect(sendCountsForGrade(p, v2)).toBe(true);
    const { profile, breakthrough } = applySend(p, v2, card(v2), []);
    expect(profile.topGrade).toBe('V2');
    expect(breakthrough?.grade).toBe('V2');
  });

  it('setter routes and highballs never move the grade', () => {
    const p = freshProfile();
    const gen = { ...byGrade('V0'), blueprint: { difficulty: 'easy', sections: [], cruxes: [], relax: 0 } } as Route;
    expect(sendCountsForGrade(p, gen)).toBe(false);
    expect(sendCountsForGrade(p, { ...byGrade('V0'), wall: 'tower' })).toBe(false);
  });
});

describe('points only ever go up', () => {
  it('a more efficient send worth fewer points does not take points away', () => {
    const v0 = byGrade('V0');
    let p = freshProfile();
    // An onsight: worth more, less efficient.
    p = applySend(p, v0, card(v0, { efficiency: 0.6, points: 130, onsight: true }), []).profile;
    expect(p.points).toBe(130);
    // A tidier repeat: the best by efficiency changes, the points do not drop.
    p = applySend(p, v0, card(v0, { efficiency: 0.9, points: 110 }), []).profile;
    expect(p.points).toBe(130);
    expect(recordFor(p, v0.id).best?.efficiency).toBe(0.9);
    expect(bankedPoints(recordFor(p, v0.id))).toBe(130);
    // And a send worth more than anything before adds only the difference.
    p = applySend(p, v0, card(v0, { efficiency: 0.95, points: 150 }), []).profile;
    expect(p.points).toBe(150);
  });

  it('reads older records with no banked points as their best card', () => {
    const v0 = byGrade('V0');
    const p = freshProfile();
    const old = { ...recordFor(p, v0.id), sent: true, attempts: 1, best: card(v0, { points: 90 }) };
    const legacy = { ...p, points: 90, records: { [v0.id]: old } };
    const next = applySend(legacy, v0, card(v0, { points: 100, efficiency: 0.95 }), []).profile;
    expect(next.points).toBe(100);
  });
});

describe('rerolling the setter is not a points farm', () => {
  it('banks points per difficulty: a fresh route at the same difficulty adds nothing unless it beats your best', () => {
    let p = freshProfile();
    p = applySend(p, setterRoute('easy', 1), card(setterRoute('easy', 1), { points: 40 }), []).profile;
    expect(p.points).toBe(40);
    for (let i = 2; i < 12; i++) {
      p = applySend(p, setterRoute('easy', i), card(setterRoute('easy', i), { points: 40 }), []).profile;
    }
    expect(p.points).toBe(40);
    // Beating it adds the difference; a harder difficulty has its own bank.
    p = applySend(p, setterRoute('easy', 99), card(setterRoute('easy', 99), { points: 55 }), []).profile;
    expect(p.points).toBe(55);
    p = applySend(p, setterRoute('hard', 1), card(setterRoute('hard', 1), { points: 120 }), []).profile;
    expect(p.points).toBe(175);
    expect(p.setterBest).toEqual({ easy: 55, hard: 120 });
  });

  it('keeps setter records from piling up forever, and never prunes board routes', () => {
    let p = freshProfile();
    const v0 = byGrade('V0');
    p = applySend(p, v0, card(v0), []).profile;
    for (let i = 0; i < SETTER_RECORDS + 25; i++) {
      const r = setterRoute('easy', i);
      p = applySend(p, r, card(r, { sentAt: 2000 + i }), []).profile;
    }
    const setter = Object.keys(p.records).filter((id) => id.startsWith('gen-'));
    expect(setter.length).toBe(SETTER_RECORDS);
    expect(p.records[v0.id]).toBeTruthy();
    // The newest are the ones kept.
    expect(p.records[setterRoute('easy', SETTER_RECORDS + 24).id]).toBeTruthy();
    expect(p.records[setterRoute('easy', 0).id]).toBeUndefined();
  });
});

describe('loading a save', () => {
  it('keeps everything valid and repairs what is missing or broken', () => {
    const v0 = byGrade('V0');
    const raw = {
      version: 1,
      points: 210,
      topGrade: 'V3',
      records: { [v0.id]: { sent: true, attempts: 4 } },
      tread: { best: { classic: { time: 61 } } },
      totalSends: 'lots',
    } as unknown as Parameters<typeof normalizeProfile>[0];
    const p = normalizeProfile(raw);
    expect(p.points).toBe(210);
    expect(p.topGrade).toBe('V3');
    expect(p.records[v0.id].sent).toBe(true);
    expect(p.records[v0.id].falls).toBe(0);
    expect(p.tread.runs).toEqual([]);
    expect(p.tread.best.classic).toBeTruthy();
    expect(p.totalSends).toBe(0);
    expect(p.setterBest).toEqual({});
  });

  it('drops a grade it does not recognise rather than crashing on it', () => {
    const p = normalizeProfile({ version: 1, topGrade: 'V99' } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(p.topGrade).toBeNull();
  });
});

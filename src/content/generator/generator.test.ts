import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, generateRoute, generatedRouteById } from './index';
import { applySend, freshProfile } from '../../state/progress';
import { gradeIndex } from '../../game/types';
import { endToEnd } from './endToEnd';

/**
 * The route setter.
 *
 * Two kinds of test. The slow kind sets real routes end to end — plan, holds,
 * validation, a headless send — and then checks the result independently, the
 * same way the hand-set routes are checked. The fast kind sets hundreds of
 * candidate routes per difficulty without climbing them, and checks that the
 * *population* behaves: harder tiers really are more sideways, more twisty,
 * more combined, and have their cruxes late.
 *
 * The difficulties are split between this file and generator-e2e.test.ts, and
 * the population checks are in generator-population.test.ts, so the three
 * run in parallel.
 */

describe('generated routes, end to end', () => {
  for (const d of DIFFICULTIES.filter((_, i) => i % 2 === 0)) endToEnd(d);
});

describe('generated routes and progression', () => {
  it('a generated send is scored but does not move your grade', () => {
    const route = generatedRouteById(generateRoute('brutal', 11).route.id)!;
    const card = {
      routeId: route.id, grade: route.grade, moves: 30, par: route.par, falls: 0, perfect: 10,
      good: 10, scrape: 10, whiffed: 0, timeMs: 60000, efficiency: 0.8, points: 500, onsight: true, sentAt: 1,
    };
    const { profile, breakthrough } = applySend(freshProfile(), route, card, []);
    expect(profile.topGrade).toBeNull();
    expect(breakthrough).toBeNull();
    expect(profile.records[route.id].sent).toBe(true);
    expect(profile.totalSends).toBe(1);
    expect(gradeIndex(route.grade)).toBeGreaterThanOrEqual(gradeIndex('V7'));
  });
});

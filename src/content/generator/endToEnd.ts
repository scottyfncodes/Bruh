import { describe, expect, it } from 'vitest';
import { type Difficulty, buildRoute, generateRoute, generatedRouteById, parseGeneratedId } from './index';
import { replays, tighten } from './validate';
import { TIERS } from './difficulty';
import { solveRoute } from '../../game/autoplay';
import { initialState } from '../../game/move';
import { WALL } from '../wall';
import { SETTERS } from '../setters';
import { routeById } from '../routes';
import { gradeIndex } from '../../game/types';

/**
 * The slow kind of route setter test: set real routes at one difficulty end
 * to end, then check them independently, the same way the hand-set routes are
 * checked. The difficulties are shared between two test files so they run in
 * parallel.
 */
export function endToEnd(d: Difficulty): void {
  describe(d, () => {
    const results = [11, 4242].map((seed) => generateRoute(d, seed));

    for (const [i, g] of results.entries()) {
      const route = g.route;
      describe(`#${i + 1} ${route.grade} ${route.name}`, () => {
        it('is real route data', () => {
          const ids = route.holds.map((h) => h.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(SETTERS[route.setter]).toBeDefined();
          // The grade is the assessment of its moves, held to the tier give or take one.
          const band = TIERS[d].grades.map(gradeIndex);
          expect(gradeIndex(route.grade)).toBeGreaterThanOrEqual(Math.min(...band) - 1);
          expect(gradeIndex(route.grade)).toBeLessThanOrEqual(Math.max(...band) + 1);
          expect(parseGeneratedId(route.id)?.grade).toBe(gradeIndex(route.grade));
          for (const h of route.holds) {
            expect(h.pos.x).toBeGreaterThanOrEqual(WALL.minX);
            expect(h.pos.x).toBeLessThanOrEqual(WALL.maxX);
            expect(h.pos.y).toBeGreaterThanOrEqual(WALL.minY);
            expect(h.pos.y).toBeLessThanOrEqual(WALL.maxY);
          }
        });

        it('starts standing and finishes at the top', () => {
          const s = initialState(route.holds, route.start, ((route.overhang ?? 0) * Math.PI) / 180);
          expect(s.contacts).toHaveLength(4);
          expect(s.pose.stability).toBeGreaterThan(0.4);
          for (const id of route.finish) {
            expect(route.holds.find((h) => h.id === id)!.pos.y).toBeGreaterThan(3.4);
          }
        });

        it('can actually be climbed, by an independent search', () => {
          const sol = solveRoute(route, { beam: 20, depth: 140 });
          expect(sol.sent).toBe(true);
          // ...and the send the setter tightened par from still replays.
          expect(replays(route, tighten(route, sol.moves))).toBe(true);
        });

        it('sets a par a clean climb could hit', () => {
          expect(route.par).toBeGreaterThan(8);
          // Taller tiers take more moves: the cap scales with the climb.
          expect(route.par).toBeLessThan(25 * (TIERS[d].top - 1.5));
        });

        it('did not need many tries', () => {
          // Shape rejects are cheap and expected. Climbs are not.
          expect(g.climbs).toBeLessThanOrEqual(6);
          expect(route.blueprint?.relax ?? 0).toBeLessThanOrEqual(1);
        });

        it('can be rebuilt from its id alone', () => {
          const parsed = parseGeneratedId(route.id)!;
          expect(parsed.difficulty).toBe(d);
          const rebuilt = buildRoute(parsed.difficulty, parsed.seed, { relax: parsed.relax }).route;
          expect(rebuilt.holds).toEqual(route.holds);
          expect(rebuilt.name).toBe(route.name);
          expect(generatedRouteById(route.id)?.par).toBe(route.par);
          expect(routeById(route.id)?.holds).toEqual(route.holds);
        });
      });
    }

    it('is deterministic for a seed', () => {
      const again = generateRoute(d, 11);
      expect(again.route.id).toBe(results[0].route.id);
      expect(again.route.holds).toEqual(results[0].route.holds);
    });
  });
}

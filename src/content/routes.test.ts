import { describe, expect, it } from 'vitest';
import { ROUTES } from './routes';
import { GRADES } from '../game/types';
import { SETTERS } from './setters';
import { initialState } from '../game/move';
import { WALL } from './wall';

// The slow checks, climbing every route, are in routes-climb-*.test.ts and
// routes-board.test.ts, so they run alongside each other instead of in a line.
describe('route data', () => {
  it('has unique ids', () => {
    const ids = ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const route of ROUTES) {
    describe(`${route.grade} ${route.name}`, () => {
      it('has unique hold ids and a real setter', () => {
        const ids = route.holds.map((h) => h.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(SETTERS[route.setter]).toBeDefined();
      });

      it('starts every limb on a hold that exists', () => {
        for (const id of Object.values(route.start)) {
          expect(route.holds.some((h) => h.id === id)).toBe(true);
        }
        const s = initialState(route.holds, route.start);
        expect(s.contacts).toHaveLength(Object.keys(route.start).length);
        expect(s.pose.stability).toBeGreaterThan(0.4);
      });

      it('finishes on holds that exist and are near the top', () => {
        for (const id of route.finish) {
          const h = route.holds.find((x) => x.id === id);
          expect(h).toBeDefined();
          expect(h!.pos.y).toBeGreaterThan(3.4);
        }
      });

      it('keeps every hold inside the wall', () => {
        for (const h of route.holds) {
          expect(h.pos.x).toBeGreaterThanOrEqual(WALL.minX);
          expect(h.pos.x).toBeLessThanOrEqual(WALL.maxX);
          expect(h.pos.y).toBeGreaterThanOrEqual(WALL.minY);
          expect(h.pos.y).toBeLessThanOrEqual(WALL.maxY);
        }
      });
    });
  }

  it('has routes at every grade from V0 to V17', () => {
    for (const g of GRADES) expect(ROUTES.some((r) => r.grade === g)).toBe(true);
  });
});

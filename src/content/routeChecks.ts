import { expect, it } from 'vitest';
import type { Route } from '../game/types';
import { BOARD_SOURCES, ROUTES } from './routes';
import { solveRoute } from '../game/autoplay';

/**
 * The slow half of the route checks: a headless climber sends each route,
 * and par is held against a perfect-aim solve. Split across test files so
 * they run in parallel. The long routes at the top of the board are checked
 * against the setter that made them instead, in routes-board.test.ts.
 */
export const climbed = ROUTES.filter((r) => !BOARD_SOURCES.has(r.id));

export function climbChecks(route: Route): void {
  it('can actually be climbed', () => {
    const sol = solveRoute(route);
    expect(sol.sent).toBe(true);
  });

  it('sets a par a clean climb could actually hit', () => {
    // Par is measured against a perfect-aim solver, then given a little
    // room, so a good human climb lands near it rather than miles over.
    const sol = solveRoute(route, { beam: 40, depth: 48 });
    expect(sol.moves.length).toBeGreaterThan(5);
    expect(route.par).toBeGreaterThanOrEqual(sol.moves.length);
    expect(route.par).toBeLessThanOrEqual(sol.moves.length + 5);
  });
}

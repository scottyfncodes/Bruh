import { describe, expect, it } from 'vitest';
import { BOARD_SOURCES, ROUTES } from './routes';
import { buildRoute, parseGeneratedId } from './generator';
import { checkClimb, checkShape, checkStructure } from './generator/validate';
import { TIERS } from './generator/difficulty';

describe('the top of the board', () => {
  for (const [id, from] of BOARD_SOURCES) {
    const route = ROUTES.find((r) => r.id === id)!;
    it(`${route.grade} ${route.name} is still the route the setter climbed`, () => {
      const p = parseGeneratedId(from)!;
      const b = buildRoute(p.difficulty, p.seed, { relax: p.relax });
      expect(b.route.holds).toEqual(route.holds);
      expect(TIERS[p.difficulty].grades).toContain(route.grade);
      expect(route.par).toBe(p.par);
      expect(route.blueprint).toBeUndefined();
      expect(checkStructure(b)).toBeNull();
      expect(checkShape(b, p.difficulty)).toBeNull();
      expect(checkClimb(b).ok).toBe(true);
    }, 60000);
  }

  it('gets longer and taller as it gets harder', () => {
    const top = ROUTES.filter((r) => BOARD_SOURCES.has(r.id));
    const height = (r: typeof top[number]) => Math.max(...r.holds.map((h) => h.pos.y));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const v10 = ROUTES.filter((r) => r.grade === 'V10');
    const v11to13 = top.filter((r) => ['V11', 'V12', 'V13'].includes(r.grade));
    const v14up = top.filter((r) => !['V11', 'V12', 'V13'].includes(r.grade));
    expect(mean(v11to13.map(height))).toBeGreaterThan(mean(v10.map(height)) + 1);
    expect(mean(v14up.map(height))).toBeGreaterThan(mean(v11to13.map(height)) + 0.5);
    expect(mean(v14up.map((r) => r.par))).toBeGreaterThan(mean(v10.map((r) => r.par)));
  });
});

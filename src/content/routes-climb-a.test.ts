import { describe } from 'vitest';
import { climbChecks, climbed } from './routeChecks';

describe('routes go (every other route, from the first)', () => {
  for (const route of climbed.filter((_, i) => i % 2 === 0)) {
    describe(`${route.grade} ${route.name}`, () => climbChecks(route));
  }
});

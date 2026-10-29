import { describe } from 'vitest';
import { climbChecks, climbed } from './routeChecks';

describe('routes go (every other route, from the second)', () => {
  for (const route of climbed.filter((_, i) => i % 2 === 1)) {
    describe(`${route.grade} ${route.name}`, () => climbChecks(route));
  }
});

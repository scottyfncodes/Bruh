import { describe } from 'vitest';
import { DIFFICULTIES } from './index';
import { endToEnd } from './endToEnd';

describe('generated routes, end to end (the other difficulties)', () => {
  for (const d of DIFFICULTIES.filter((_, i) => i % 2 === 1)) endToEnd(d);
});

import { describe, expect, it } from 'vitest';
import { ROUTES } from '../content/routes';
import { WALL } from '../content/wall';
import { profileOf } from './profile';
import {
  type SlingEvent, type SlingState,
  SLING, canLaunch, heldCount, initialSling, isSlingSent, launch, stepSling,
} from './sling';
import { LIMBS } from './types';

/**
 * The body must never gain energy it was not given. These throw limbs at
 * random — far more chaotically than any thumb — on six routes from V0 to
 * V10 and watch for the ways a position-based sim can cheat: a correction
 * read back as a launch, a body that leaves the wall it is climbing, and a
 * climber with nothing in their hands who never comes down.
 */

const ROUTE_IDS = ['warmup', 'trust-feet', 'absolutely-not', 'the-cave', 'ceiling', 'grip-it'];
const EPISODES = 40;
const THROWS = 20;
const STEPS_AFTER = 300; // 2.5 s after each throw

/**
 * Faster than any throw or swing can make the hips go up or sideways. A full
 * hand throw is 5.2 m/s; the body follows a reach at about that.
 */
const MAX_BODY_SPEED = 9;
/**
 * Going down, a body can go as fast as falling from the highest it got plus
 * what a limb thrown downward drags it at: the reach makes the body follow a
 * thrown limb, and a hand flung at the floor at full power takes the
 * shoulders with it while gravity keeps working on them. Half again a full
 * throw covers that; the launches this suite exists for were 17–60 m/s.
 */
const THROW_SPEED = 5.2 * 1.5;
const G_MAX = SLING.gravity * 1.25;

/** A speed the body could not have got from gravity, a throw or a swing. */
function unexplained(v: { x: number; y: number }, y: number, peak: number, k = 1): boolean {
  if (v.y > MAX_BODY_SPEED * k * 0.75) return true; // up
  if (Math.abs(v.x) > MAX_BODY_SPEED * k) return true; // sideways
  const fall = Math.sqrt(2 * G_MAX * Math.max(0, peak - y)) + THROW_SPEED * k;
  return -v.y > fall; // down, faster than the drop allows
}
/** How far past the wall's edge the hips may hang off a hold on it, while anything is held. */
const EDGE_MARGIN = 0.3;
/** Highest the hips can be over the top hold: stood up on it, and a bit. */
const ABOVE_TOP = 1.5;

type Stats = {
  throws: number;
  spikes: number;
  tooHigh: number;
  offEdge: number;
  maxUnheld: number;
  fallsResolved: number;
};

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function fuzz(routeId: string, seed = 7): Stats {
  const route = ROUTES.find((r) => r.id === routeId);
  if (!route) throw new Error(`no route ${routeId}`);
  const rnd = lcg(seed);
  const top = Math.max(...route.holds.map((h) => h.pos.y));
  const stats: Stats = { throws: 0, spikes: 0, tooHigh: 0, offEdge: 0, maxUnheld: 0, fallsResolved: 0 };
  for (let ep = 0; ep < EPISODES; ep++) {
    const s = initialSling(route.holds, route.start, profileOf(route));
    let spiked = false, high = false, edge = false;
    let unheld = 0;
    let peak = s.shoulder.y;
    for (let t = 0; t < THROWS && !s.fallen; t++) {
      const limb = LIMBS[Math.floor(rnd() * 4)];
      const a = (rnd() * 2 - 1) * Math.PI * 0.8;
      const power = 0.2 + rnd() * 0.8;
      if (!canLaunch(s, limb)) continue;
      launch(s, { limb, dir: { x: Math.sin(a), y: Math.cos(a) }, power });
      stats.throws++;
      for (let k = 0; k < STEPS_AFTER && !s.fallen; k++) {
        stepSling(s, route.holds, SLING.dt, 0, []);
        peak = Math.max(peak, s.hip.y, s.shoulder.y);
        if (!s.dyno && (unexplained(s.hipV, s.hip.y, peak) || unexplained(s.shV, s.shoulder.y, peak, 1.5))) spiked = true;
        if (!s.dyno && s.hip.y > top + ABOVE_TOP) high = true;
        // On the wall, the hips stay over it. With nothing held the body is
        // falling, and a fall can drift a little past the edge on its way down
        // — that is a fall, judged by the speed and height checks above.
        if (heldCount(s) > 0 && Math.abs(s.hip.x) > Math.max(WALL.maxX, -WALL.minX) + EDGE_MARGIN) edge = true;
        if (heldCount(s) === 0 && !s.dyno) unheld += SLING.dt; else unheld = 0;
        stats.maxUnheld = Math.max(stats.maxUnheld, unheld);
      }
      if (isSlingSent(s, route.finish)) break;
    }
    // Whatever is left of the episode: nothing more is thrown, the body must settle or come down.
    for (let k = 0; k < 600 && !s.fallen; k++) {
      stepSling(s, route.holds, SLING.dt, 0, []);
      if (heldCount(s) === 0 && !s.dyno) unheld += SLING.dt; else unheld = 0;
      stats.maxUnheld = Math.max(stats.maxUnheld, unheld);
    }
    if (s.fallen) stats.fallsResolved++;
    if (spiked) stats.spikes++;
    if (high) stats.tooHigh++;
    if (edge) stats.offEdge++;
  }
  return stats;
}

describe('stability: random throws never put energy into the body', () => {
  for (const id of ROUTE_IDS) {
    it(`${id}: no launches out of nowhere, no leaving the wall, no hovering`, () => {
      const st = fuzz(id);
      // The numbers, in the test output: what a regression looks like before it fails.
      console.info(`${id}: ${JSON.stringify(st)}`);
      expect(st.throws).toBeGreaterThan(100);
      expect(st, 'body speed spikes outside a dyno').toMatchObject({ spikes: 0 });
      expect(st.tooHigh, 'hips far above the top of the route').toBe(0);
      expect(st.offEdge, 'hips past the edge of the wall while on it').toBe(0);
      // Nothing held and not falling is a fall, within the grace period.
      expect(st.maxUnheld).toBeLessThanOrEqual(SLING.fallGrace + SLING.dt * 2);
    }, 60_000);
  }
});

function settle(s: SlingState, holds = ROUTES[0].holds, seconds = 1, events: SlingEvent[] = []) {
  for (let i = 0; i < Math.round(seconds / SLING.dt); i++) stepSling(s, holds, SLING.dt, 0, events);
  return events;
}

describe('stability: the states that used to go wrong', () => {
  const route = ROUTES.find((r) => r.id === 'warmup')!;
  const fresh = () => initialSling(route.holds, route.start, profileOf(route));

  it('a body lying on the mat off one low foot does not stand itself up at speed: it has fallen', () => {
    const s = fresh();
    // Lay the climber flat on the mat with only a foot left on a start foothold.
    s.left = true;
    s.hip = { x: 0.7, y: 0.34 };
    s.shoulder = { x: 1.2, y: 0.3 };
    s.hipV = { x: 1.6, y: 0 };
    s.shV = { x: 1.6, y: 0 };
    for (const id of ['LH', 'RH', 'RF'] as const) {
      const l = s.limbs[id];
      l.phase = 'free'; l.holdId = null;
      l.pos = { x: 0.2, y: 0.14 };
    }
    const events = settle(s, route.holds, 1);
    let maxV = 0;
    // The step that used to snap the torso upright is in the first few.
    expect(s.fallen).toBe(true);
    expect(events.some((e) => e.kind === 'fell')).toBe(true);
    maxV = Math.max(Math.hypot(s.hipV.x, s.hipV.y), maxV);
    expect(maxV).toBeLessThan(MAX_BODY_SPEED);
  });

  it('letting go of everything high on the wall is a fall that lands, within the grace period', () => {
    const s = fresh();
    settle(s, route.holds, 0.5);
    s.hip.y += 2; s.shoulder.y += 2;
    for (const id of LIMBS) { const l = s.limbs[id]; l.phase = 'free'; l.holdId = null; l.pos.y += 2; }
    const events = settle(s, route.holds, SLING.fallGrace + 0.1);
    expect(s.fallen).toBe(true);
    const fell = events.find((e) => e.kind === 'fell');
    expect(fell && fell.kind === 'fell' && fell.from).toBeGreaterThan(2);
  });

  it('a one-arm hang settles and stays on', () => {
    const s = fresh();
    for (const id of ['LH', 'LF', 'RF'] as const) { const l = s.limbs[id]; l.phase = 'free'; l.holdId = null; }
    settle(s, route.holds, 3);
    expect(s.fallen).toBe(false);
    expect(s.limbs.RH.phase).toBe('held');
    expect(Math.hypot(s.hipV.x, s.hipV.y)).toBeLessThan(1);
  });

  // A full dyno going nearly three metres is held to account in sling.test.ts
  // ('the dyno' > 'a full one ...'), which runs unchanged.
});

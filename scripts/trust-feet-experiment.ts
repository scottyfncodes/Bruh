/**
 * The Trust Your Feet experiment: the route as it was before the reset, and
 * the route as it is now, run through the same checks.
 *
 *   npm run experiment:trust-feet
 *
 * For each layout: the climbing bot in both styles with its feet as played,
 * with its feet never moved, and with its feet only ever smeared on blank
 * wall; what it touched; the community-beta solver; and the grader on those
 * betas. A route about its feet should go worse, or not at all, without them.
 */
import type { Route } from '../src/game/types';
import { ROUTES } from '../src/content/routes';
import { foot, jug } from '../src/content/holdKit';
import { type BotMove, type ClimbReport, type FeetMode, type Style, climb } from '../src/game/climbBot';
import { solveRoute } from '../src/game/autoplay';
import { betaDistance, type Beta } from '../src/game/attempt';
import { gradeRoute } from '../src/game/grading';
import { isHand } from '../src/game/types';

/** The route as it stood at PR #28 (commit 619c553). */
const ORIGINAL: Route = {
  id: 'trust-feet',
  name: 'Trust Your Feet',
  grade: 'V0',
  setter: 'house',
  wall: 'main',
  tagline: 'The hands are a formality.',
  par: 16,
  start: { LH: 1, RH: 2, LF: 3, RF: 4 },
  finish: [22],
  holds: [
    jug(1, -0.36, 1.55), jug(2, 0.3, 1.52),
    foot(3, -0.42, 0.48), foot(4, 0.4, 0.52),
    foot(5, -0.2, 1.0), foot(6, 0.46, 1.06),
    jug(7, -0.42, 2.06), jug(8, 0.26, 2.1),
    foot(9, -0.44, 1.5), foot(10, 0.28, 1.58),
    jug(11, -0.2, 2.58), jug(12, 0.44, 2.6),
    foot(13, -0.4, 2.02), foot(14, 0.3, 2.1),
    jug(15, -0.36, 3.05), jug(16, 0.26, 3.12),
    foot(17, -0.22, 2.54), foot(18, 0.42, 2.6),
    foot(19, -0.34, 3.02), foot(20, 0.28, 3.08),
    jug(21, -0.24, 3.55),
    jug(22, 0.2, 3.84, { finish: true }),
  ],
};

/** Up to three meaningfully different betas, found the way `gen:beta` finds them. */
function betasOf(route: Route): Beta[] {
  const found: Beta[] = [];
  for (const style of [0, 1337, 24601, 90210, 5150, 8675309]) {
    const sol = solveRoute(route, { beam: 26, depth: 46, style });
    if (!sol.sent) continue;
    const beta: Beta = sol.moves.map((m) => ({ limb: m.limb, holdId: m.holdId }));
    if (found.some((f) => betaDistance(f, beta) < 0.3)) continue;
    found.push(beta);
    if (found.length >= 3) break;
  }
  return found;
}

function counts(seq: { limb: string; holdId: number | null; smear?: boolean }[]) {
  const hands = seq.filter((m) => m.limb === 'LH' || m.limb === 'RH').length;
  const feet = seq.filter((m) => m.limb === 'LF' || m.limb === 'RF').length;
  const smears = seq.filter((m) => m.smear).length;
  return { hands, feet, smears };
}

function used(route: Route, ids: Iterable<number | null>) {
  const set = new Set([...ids].filter((x): x is number => x !== null));
  const feet = route.holds.filter((h) => h.type === 'foothold');
  const hands = route.holds.filter((h) => h.type !== 'foothold');
  return {
    hands: `${hands.filter((h) => set.has(h.id)).length}/${hands.length}`,
    feet: `${feet.filter((h) => set.has(h.id)).length}/${feet.length}`,
  };
}

function report(label: string, route: Route): void {
  console.log(`\n=== ${label}: ${route.holds.length} holds, wall ${route.overhang ?? 0}° ===`);
  console.log('bot                 outcome  moves hand foot smear dynos time   peakPump hands  feet');
  const runs: [Style, FeetMode, ClimbReport][] = [];
  for (const feet of ['on', 'off', 'smear'] as FeetMode[]) {
    for (const style of ['efficient', 'reckless'] as Style[]) {
      const r = climb(route, style, { feet });
      runs.push([style, feet, r]);
      const c = counts(r.sequence);
      const u = used(route, r.sequence.map((m: BotMove) => m.holdId));
      console.log(
        `${style.padEnd(9)} feet ${feet.padEnd(5)} ${r.outcome.padEnd(8)} ${String(r.moves).padEnd(5)} ${String(c.hands).padEnd(4)} `
        + `${String(c.feet).padEnd(4)} ${String(c.smears).padEnd(5)} ${String(r.dynos).padEnd(5)} ${String(r.time).padEnd(6)} `
        + `${String(r.maxPump).padEnd(8)} ${u.hands.padEnd(6)} ${u.feet}`,
      );
    }
  }
  const betas = betasOf(route);
  console.log(`solver betas: ${betas.length}`);
  betas.forEach((b, i) => {
    const c = counts(b);
    const u = used(route, b.map((m) => m.holdId));
    console.log(`  beta ${i + 1}: ${b.length} moves, ${c.hands} hand / ${c.feet} foot, holds used ${u.hands} hand ${u.feet} foot`);
  });
  const all = used(route, betas.flat().map((m) => m.holdId));
  console.log(`  all betas together: hand holds ${all.hands}, foot holds ${all.feet}`);
  if (betas.length) {
    const g = gradeRoute(route, betas);
    console.log(`grader: ${g.grade} (score ${g.score.toFixed(2)}), crux move ${g.crux.index + 1} on hold ${g.crux.holdId}, `
      + `techniques ${g.techniques.join(', ')}`);
  } else {
    console.log('grader: no betas, not graded');
  }
  void isHand;
}

const current = ROUTES.find((r) => r.id === 'trust-feet');
if (!current) throw new Error('trust-feet is missing from the route book');
if (!process.env.ONLY_CURRENT) report('Original (PR #28)', ORIGINAL);
report('Experimental (current route book)', current);

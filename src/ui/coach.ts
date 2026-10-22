/**
 * The coach: one short tip at a time, at the moment it is useful.
 *
 * The game used to explain itself in one paragraph before the first move.
 * Now each idea turns up when it first matters — how to throw before the
 * first throw, what the ring means while aiming, why a hold let go the first
 * time one does, the pump when it first starts to bite, the dyno when it is
 * first ready — and goes away once you have done the thing it describes.
 * Each tip is shown once, ever; "Skip tips" turns them all off. The depth is
 * all still there in the route's "How climbing works" notes.
 */

export type CoachStep = 'pick' | 'aim' | 'stuck' | 'fail' | 'pump' | 'dyno' | 'tread';

export type CoachState = { done: CoachStep[]; off: boolean };

const KEY = 'bruh.coach.v1';

export function loadCoach(): CoachState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return { done: [], off: false };
    const parsed = JSON.parse(raw) as Partial<CoachState>;
    return { done: Array.isArray(parsed.done) ? parsed.done : [], off: parsed.off === true };
  } catch {
    return { done: [], off: false };
  }
}

export function saveCoach(state: CoachState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* play on */ }
}

/** Whether a tip should still be shown. */
export function wantsTip(state: CoachState, step: CoachStep): boolean {
  return !state.off && !state.done.includes(step);
}

export function markDone(state: CoachState, step: CoachStep): CoachState {
  return state.done.includes(step) ? state : { ...state, done: [...state.done, step] };
}

/** True on a device with a mouse or trackpad rather than a touchscreen. */
export function isDesktop(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** What each tip says, for a finger or a mouse. Short: two lines on a phone. */
export function tipText(step: CoachStep, desktop: boolean): { title: string; body: string } {
  switch (step) {
    case 'pick': return desktop
      ? { title: 'Make your first move', body: 'Click a hand or foot (or press Q W A S), drag away from where you want it to go, and release.' }
      : { title: 'Make your first move', body: 'Press a hand or foot and drag it back, away from where you want it to go, like a slingshot. Let go to throw.' };
    case 'aim': return {
      title: 'Aiming',
      body: `The ring marks the hold it is going for. Pull further to reach further.${desktop ? ' Esc puts it down.' : ''}`,
    };
    case 'stuck': return { title: 'Stuck it', body: 'Big holds forgive a messy arrival. Small ones want your feet on and the body settled first.' };
    case 'fail': return { title: 'It came off', body: 'The banner says why. Every miss and slip names its cause. That is the lesson for the next go.' };
    case 'pump': return desktop
      ? { title: 'Getting pumped', body: 'Stand on your feet to recover. Pick a hand and press X to shake it out while your feet hold you.' }
      : { title: 'Getting pumped', body: 'Stand on your feet to recover. Tap a held hand twice to shake it out while your feet hold you.' };
    case 'dyno': return {
      title: 'Dyno ready',
      body: `Grab Bernie's belly${desktop ? ' (or press E)' : ''} and pull back to jump the whole body up the wall.`,
    };
    case 'tread': return { title: 'The wall moves', body: 'The belt rolls down all the time. Climb faster than it to stay above the floor; rest where your feet take the weight.' };
  }
}

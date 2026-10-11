import { type Profile, SAVE_VERSION, freshProfile, normalizeProfile } from './progress';

/**
 * Local save. One key, one JSON blob, version-guarded.
 *
 * Everything the game needs lives on the device for now. The shape is
 * deliberately serialisable and flat so that dropping a backend in later means
 * posting this object rather than reworking it.
 */

const KEY = 'bruh.profile.v1';
/** The game has been called SEND and Boulder, and is now Bruh. Saves outlive names. */
const LEGACY_KEYS = ['boulder.profile.v1', 'send.profile.v1'];
/** Where a save that could not be read is kept, untouched, before a fresh one replaces it. */
const BACKUP_KEY = 'bruh.profile.backup';

export function loadProfile(): Profile {
  if (typeof localStorage === 'undefined') return freshProfile();
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const old of LEGACY_KEYS) {
        raw = localStorage.getItem(old);
        if (raw) break;
      }
    }
    if (!raw) return freshProfile();
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (parsed.version !== SAVE_VERSION) {
      // A save from some other version is never thrown away: it is kept to
      // one side before a fresh profile starts writing over the key.
      backup(raw);
      return freshProfile();
    }
    return normalizeProfile(parsed);
  } catch {
    // A corrupt save should cost the player their history, not the game —
    // and is kept to one side, in case it can be read by hand.
    try { const raw = localStorage.getItem(KEY); if (raw) backup(raw); } catch { /* ignore */ }
    return freshProfile();
  }
}

function backup(raw: string): void {
  try {
    if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw);
  } catch { /* quota: nothing more we can do */ }
}

export function saveProfile(profile: Profile): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Private mode, quota, whatever. Play on.
  }
}

export function clearProfile(): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

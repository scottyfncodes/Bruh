import { useEffect } from 'react';
import type { Profile } from '../state/progress';
import { ROUTES } from '../content/routes';
import './title.css';

/**
 * The front door.
 *
 * A lit patch of climbing wall with Bernie on it, the wordmark stuck on like
 * a sticker, one button. The three numbered lines underneath are the entire
 * manual, because the entire game is one gesture repeated — and the board
 * the button opens puts the practice wall and the first V0s right at the top.
 */
export function Title({
  profile, onStart, onStandings,
}: {
  profile: Profile;
  onStart: () => void;
  onStandings: () => void;
}) {
  const returning = profile.totalSends > 0 || profile.totalFalls > 0;
  const sent = ROUTES.filter((r) => profile.records[r.id]?.sent).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="title">
      <div className="title__wall" aria-hidden="true">
        {HOLDS.map((h, i) => (
          <i key={i} className="title__hold" style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.s}rem`, height: `${h.s * 0.82}rem`, background: h.c, transform: `rotate(${h.r}deg)` }} />
        ))}
      </div>
      <div className="title__glow" aria-hidden="true" />

      <div className="title__inner">
        <div className="title__hero">
          <img className="title__bernie" src="./icon-512.png" alt="" draggable={false} />
        </div>

        <div className="title__kicker">Fling · Stick · Send</div>
        <h1 className="title__mark">BRUH</h1>
        <p className="title__tag">
          Throw your limbs at the wall, one at a time. The rest of Bernie has to deal with it.
        </p>

        <button className="btn btn--primary title__go" onClick={onStart}>
          {returning ? 'Back to the wall' : 'Start climbing'}
        </button>

        {returning ? (
          <div className="title__stats" role="list">
            <div className="title__stat" role="listitem">
              <b>{profile.topGrade ?? '–'}</b><span>top grade</span>
            </div>
            <div className="title__stat" role="listitem">
              <b>{sent}<i>/{ROUTES.length}</i></b><span>routes sent</span>
            </div>
            <div className="title__stat" role="listitem">
              <b>{profile.points}</b><span>points</span>
            </div>
          </div>
        ) : (
          <ol className="title__steps" aria-label="How it plays">
            <li><b>Press</b> a hand or a foot.</li>
            <li><b>Pull</b> it back, like a slingshot.</li>
            <li><b>Let go</b> and see what the body does.</li>
          </ol>
        )}

        <div className="title__row">
          {returning && (
            <button className="btn btn--ghost title__link" onClick={onStandings}>Standings</button>
          )}
        </div>

        <p className="title__foot">
          Pump, physics, and a man in sunglasses who is not especially invested.
        </p>
      </div>
    </div>
  );
}

/** The holds on the title wall: a few problems' worth of tape colours. */
const HOLDS = [
  { x: 9, y: 14, s: 2.2, c: '#5fd1a0', r: 12 },
  { x: 80, y: 9, s: 1.8, c: '#57b6e8', r: -20 },
  { x: 86, y: 34, s: 2.6, c: '#f2c249', r: 30 },
  { x: 4, y: 42, s: 1.6, c: '#e8564f', r: -8 },
  { x: 70, y: 52, s: 1.4, c: '#c05ce0', r: 45 },
  { x: 18, y: 60, s: 1.9, c: '#57b6e8', r: 4 },
  { x: 48, y: 4, s: 1.5, c: '#f08a3c', r: -35 },
];

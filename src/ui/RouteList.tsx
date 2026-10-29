import { useMemo, useState } from 'react';
import type { Grade, Route } from '../game/types';
import { GRADES } from '../game/types';
import { ROUTES, routeById } from '../content/routes';
import { setterOf } from '../content/setters';
import { type Profile, isUnlocked, projectStatus, recordFor, onsightAvailable } from '../state/progress';
import { attemptsRemaining, type DailyState } from '../game/daily';
import { GRADE_COLOR } from '../render/palette';
import { SLING_LAB } from '../content/lab';
import type { Difficulty } from '../content/generator';
import { RouteSetter, type SetterState } from './RouteSetter';
import { type ClimbMode, ModeTabs } from './ModeTabs';
import { assessmentOf } from '../content/routeGrades';
import './routelist.css';
import './sling.css';

/**
 * The route board.
 *
 * Grades open one rung above whatever you have actually sent, so there is
 * always exactly one row of routes you have no business trying yet, clearly
 * visible, which is how a bouldering gym works. The rungs above that are one
 * line, not a dozen greyed-out rows.
 *
 * A new player sees the practice wall first, marked as the place to start,
 * and the V0s straight under it; the daily and the route setter come after.
 * Once something is sent, the daily moves up to where a regular looks first.
 */

export type RouteListProps = {
  profile: Profile;
  daily: DailyState;
  onClimb: (route: Route, opts: { daily?: boolean }) => void;
  onToggleProject: (routeId: string) => void;
  onStandings: () => void;
  setter: SetterState;
  onSetterPick: (d: Difficulty) => void;
  onSetterReroll: () => void;
  onMode: (m: ClimbMode) => void;
};

export function RouteList({
  profile, daily, onClimb, onToggleProject, onStandings, setter, onSetterPick, onSetterReroll, onMode,
}: RouteListProps) {
  const [tab, setTab] = useState<'board' | 'projects'>('board');

  const byGrade = useMemo(() => {
    const map = new Map<Grade, Route[]>();
    for (const r of ROUTES) {
      const list = map.get(r.grade) ?? [];
      list.push(r);
      map.set(r.grade, list);
    }
    return map;
  }, []);

  const projects = ROUTES.filter((r) => recordFor(profile, r.id).project);
  const dailyRoute = routeById(daily.routeId);
  const left = attemptsRemaining(daily);
  const newcomer = profile.totalSends === 0;
  // Every open grade, and the one rung above them; the rest is one line.
  const withRoutes = GRADES.filter((g) => (byGrade.get(g) ?? []).length > 0);
  const firstLocked = withRoutes.findIndex((g) => !isUnlocked(profile, g));
  const shownGrades = firstLocked < 0 ? withRoutes : withRoutes.slice(0, firstLocked + 1);
  const lockedAbove = withRoutes.length - shownGrades.length;
  // The daily's onsight is only live if the route has never been tried, from anywhere.
  const dailyOnsight = !!dailyRoute && daily.onsightAvailable && onsightAvailable(profile, dailyRoute.id);
  const outOfDaily = left === 0;

  const dailyCard = dailyRoute && (
    <button
      className="daily"
      disabled={outOfDaily}
      onClick={() => onClimb(dailyRoute, { daily: true })}
    >
      <div className="daily__tag">Daily climb · {left}/3 left</div>
      <div className="daily__name">
        <span className="chip" style={{ background: GRADE_COLOR[dailyRoute.grade] }}>
          {dailyRoute.grade}
        </span>
        {dailyRoute.name}
      </div>
      <div className="daily__meta">
        {daily.sent
          ? `Sent: ${daily.bestMoves} move${daily.bestMoves === 1 ? '' : 's'}, ${Math.round((daily.bestEfficiency ?? 0) * 100)}% efficiency${outOfDaily ? '. Back tomorrow.' : ''}`
          : !outOfDaily
            ? `Same route for everyone today. Three tries${dailyOnsight ? ' · onsight live' : ''}.`
            : 'Out of attempts. A new one tomorrow.'}
        {!isUnlocked(profile, dailyRoute.grade) && !daily.sent && !outOfDaily && ' Above your grade: a send scores, but opens no rungs.'}
      </div>
    </button>
  );

  return (
    <div className="board">
      <header className="board__head">
        <div>
          <div className="label">Your grade</div>
          <div className="board__grade">
            {profile.topGrade ?? '–'}
            <span className="board__gradenote">
              {profile.topGrade ? 'highest send' : 'nothing sent yet'}
            </span>
          </div>
        </div>
        <button className="board__tally" onClick={onStandings} aria-label="Standings">
          <div><b>{profile.totalSends}</b><span>sends</span></div>
          <div><b>{profile.points}</b><span>points</span></div>
          <div><b>{profile.totalFalls}</b><span>falls</span></div>
        </button>
      </header>

      <ModeTabs mode="boulder" onMode={onMode} />

      <button className={`lab${newcomer ? ' lab--start' : ''}`} onClick={() => onClimb(SLING_LAB, {})}>
        <div className="lab__tag">{newcomer ? 'Start here · practice wall' : 'Practice wall'}</div>
        <div className="lab__name">{SLING_LAB.name}</div>
        <div className="lab__meta">
          {newcomer
            ? 'A minute to learn the throw: one of every move, nothing counted. Then try a V0.'
            : `${SLING_LAB.tagline} Not graded, not scored, not counted.`}
        </div>
        {newcomer && <span className="lab__go">Try it</span>}
      </button>

      {!newcomer && dailyCard}

      <nav className="board__tabs">
        <button className={tab === 'board' ? 'is-on' : ''} onClick={() => setTab('board')}>
          Routes
        </button>
        <button className={tab === 'projects' ? 'is-on' : ''} onClick={() => setTab('projects')}>
          Projects{projects.length > 0 && <span className="pill">{projects.length}</span>}
        </button>
      </nav>

      {tab === 'projects' ? (
        <section className="board__list">
          {projects.length === 0 ? (
            <p className="board__empty">
              Nothing pinned. Star a route you keep falling off and it will wait for you here.
            </p>
          ) : (
            projects.map((r) => (
              <RouteCard
                key={r.id} route={r} profile={profile}
                onClimb={() => onClimb(r, {})}
                onToggleProject={() => onToggleProject(r.id)}
              />
            ))
          )}
        </section>
      ) : (
        <>
          {shownGrades.map((grade) => {
            const routes = byGrade.get(grade) ?? [];
            const open = isUnlocked(profile, grade);
            return (
              <section key={grade} className={`gradeblock${open ? '' : ' is-locked'}`}>
                <h2 className="gradeblock__head">
                  <span className="chip" style={{ background: GRADE_COLOR[grade] }}>{grade}</span>
                  <span className="gradeblock__count">
                    {open
                      ? `${routes.filter((r) => recordFor(profile, r.id).sent).length}/${routes.length} sent`
                      : `send a ${GRADES[GRADES.indexOf(grade) - 1]} to open`}
                  </span>
                </h2>
                {open && (
                  <div className="board__list">
                    {routes.map((r) => (
                      <RouteCard
                        key={r.id} route={r} profile={profile}
                        onClimb={() => onClimb(r, {})}
                        onToggleProject={() => onToggleProject(r.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {lockedAbove > 0 && (
            <p className="board__locked">
              {lockedAbove} more grade{lockedAbove === 1 ? '' : 's'} above, up to V17. Each opens when you send the one below.
            </p>
          )}
        </>
      )}

      {newcomer && dailyCard}

      <RouteSetter
        state={setter}
        profile={profile}
        onPick={onSetterPick}
        onReroll={onSetterReroll}
        onClimb={(r) => onClimb(r, {})}
      />

      <footer className="board__foot">
        Read the route. Plan your beta. Throw your limbs at the wall.
      </footer>
    </div>
  );
}

function RouteCard({
  route, profile, onClimb, onToggleProject,
}: {
  route: Route;
  profile: Profile;
  onClimb: () => void;
  onToggleProject: () => void;
}) {
  const rec = recordFor(profile, route.id);
  const setter = setterOf(route.setter);
  const fresh = onsightAvailable(profile, route.id);
  const assessment = assessmentOf(route.id);

  return (
    <div className={`card${rec.sent ? ' is-sent' : ''}`} style={{ ['--tape' as string]: GRADE_COLOR[route.grade] }}>
      <button className="card__main" onClick={onClimb}>
        <div className="card__top">
          <span className="card__name">{route.name}</span>
          {rec.onsighted && <span className="card__badge card__badge--onsight">ONSIGHT</span>}
          {rec.sent && !rec.onsighted && <span className="card__badge">SENT</span>}
          {fresh && <span className="card__badge card__badge--fresh">ONSIGHT LIVE</span>}
        </div>
        <div className="card__setter">{setter.name}: “{setter.line}”</div>
        {assessment && (
          <div className="card__assess">
            <span className={assessment.grade === route.grade ? '' : 'is-diff'}>assessed {assessment.grade}</span>
            {' · '}{assessment.styles.slice(0, 3).join(' · ')}
          </div>
        )}
        <div className="card__meta">
          {rec.attempts === 0
            ? `par ${route.par}`
            : rec.sent
              ? `${rec.best?.moves ?? '?'} move${rec.best?.moves === 1 ? '' : 's'} · ${Math.round((rec.best?.efficiency ?? 0) * 100)}% · ${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'}`
              : `${projectStatus(rec, route.par)} · ${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'} · best move ${rec.bestMove}`}
        </div>
      </button>
      <button
        className={`card__pin${rec.project ? ' is-on' : ''}`}
        onClick={onToggleProject}
        aria-label={rec.project ? 'Unpin project' : 'Pin as project'}
      >
        ★
      </button>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { GameView, ProfileView } from '@snacks/contracts';
import type { GameHost } from '../platform/index.ts';
import { useBook } from './BookContext.tsx';
import { StickerReveal } from './StickerReveal.tsx';
import { Icon } from './art/Icons.tsx';
import { hintsText, hintsToday } from './labels.ts';
import { countdown, retriesText, streakText, weekStrip } from './people.ts';

/**
 * Done for today (RULES 9, K7): a finished daily can't be played again, so
 * it shows how it went, the streak and a countdown to the next puzzle at
 * local midnight. The bonus round and practice are still there.
 */
export function DoneToday(props: { host: GameHost; view: GameView; profile: ProfileView }): ReactElement {
  const { host, view, profile } = props;
  const record = profile.recent.find((r) => r.day === view.day);
  const { catalogue, openBook } = useBook();
  const [revealing, setRevealing] = useState(profile.unseen.stickers.length + profile.unseen.cosmetics.length > 0);
  const clock = useRef<HTMLElement>(null);
  const [newDay, setNewDay] = useState(() => host.today() !== view.day);
  // Once a second, straight into the DOM: the screen itself doesn't re-render (P7).
  useEffect(() => {
    if (newDay) return;
    const tick = (): void => {
      const left = host.msToNextDay();
      if (clock.current !== null) clock.current.textContent = countdown(left);
      if (host.today() !== view.day) setNewDay(true);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [host, view.day, newDay]);

  const bonusWon = record?.bonus === true;
  return (
    <section className="done" aria-label="Done for today">
      {revealing && <StickerReveal host={host} profile={profile} catalogue={catalogue} kindy={false} onGone={() => setRevealing(false)} />}
      <div className="done-card">
        <Icon className="done-big" name="trophy" />
        <h2 className="done-title">Done for today!</h2>
        <ul className="done-rows">
          <li data-row="fed">
            <Icon className="row-icon" name="yum" /> Kids fed: <strong>{record?.fed ?? view.fed}</strong>
          </li>
          <li data-row="hungry">
            <Icon className="row-icon" name="sad" /> Went home hungry: <strong>{record?.hungry ?? view.hungry} of {view.hungryAllowed}</strong>
          </li>
          {record !== undefined && (
            <li data-row="tries">
              <Icon className="row-icon" name="again" /> Done on the <strong>{retriesText(record.retries)}</strong>
            </li>
          )}
          <li data-row="hints">
            <Icon className="row-icon" name="bulb" /> Hints used: <strong>{hintsText(record?.hints ?? hintsToday(view.hints))}</strong>
          </li>
          <li data-row="streak">
            <Icon className="row-icon" name="flame" /> Streak: <strong>{streakText(profile.streak)}</strong>
            {profile.best > profile.streak && <span className="muted"> (best {profile.best})</span>}
          </li>
        </ul>
        <ol className="week" aria-label="The last seven days">
          {weekStrip(profile.recent, view.day).map((d) => (
            <li key={d.day} className={d.done ? 'week-done' : ''} aria-label={d.done ? 'finished' : 'not finished'}>
              {d.done && <Icon name="star" />}
            </li>
          ))}
        </ol>
        {newDay ? (
          <p className="done-next">A new puzzle is ready!</p>
        ) : (
          <p className="done-next">
            Next puzzle in{' '}
            <strong className="done-clock" ref={clock}>
              {countdown(host.msToNextDay())}
            </strong>
          </p>
        )}
      </div>
      <div className="done-actions">
        {newDay ? (
          <button type="button" className="btn btn-primary btn-wide" onClick={() => void host.daily()}>
            Play today’s puzzle
          </button>
        ) : bonusWon ? (
          <p className="done-bonus">
            <Icon className="row-icon" name="star" /> Bonus round won too!
          </p>
        ) : (
          <button type="button" className="btn btn-primary btn-wide" onClick={() => void host.bonus()}>
            Play the bonus round
          </button>
        )}
        <div className="done-pair">
          <button type="button" className="btn" onClick={() => void host.practice()}>
            Practice board
          </button>
          <button type="button" className="btn btn-book" onClick={openBook}>
            <Icon className="row-icon" name="book" /> Sticker book
          </button>
        </div>
      </div>
    </section>
  );
}

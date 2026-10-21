import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { GameView, ProfileView } from '@snacks/contracts';
import type { GameHost } from '../platform/index.ts';
import { nightGone } from './kindy.ts';
import { useBook } from './BookContext.tsx';
import { StickerReveal } from './StickerReveal.tsx';
import { Icon } from './art/Icons.tsx';
import { KidHead } from './art/Kid.tsx';
import { weekStrip } from './people.ts';

/** How often the moon moves on: a minute is a hair's breadth on a phone-wide track. */
const MOON_MS = 30_000;

/**
 * Done for today, in pictures (RULES 9, 11; K7): a finished Kindy daily can't
 * be played again. The sun sleeps; a moon crosses the night towards the
 * sunrise, which is the next puzzle at local midnight (a picture countdown);
 * a face for each kid fed today and a star for each day of the week
 * finished. A practice board is one tap away. When the new day comes, the
 * sun wakes up and a big play button opens it.
 */
export function KindyDone(props: { host: GameHost; view: GameView; profile: ProfileView }): ReactElement {
  const { host, view, profile } = props;
  const record = profile.recent.find((r) => r.day === view.day);
  const { catalogue, openBook } = useBook();
  const [revealing, setRevealing] = useState(profile.unseen.stickers.length + profile.unseen.cosmetics.length > 0);
  const night = useRef<HTMLDivElement>(null);
  const [newDay, setNewDay] = useState(() => host.today() !== view.day);
  // Straight into the DOM: the screen itself doesn't re-render (P7).
  useEffect(() => {
    if (newDay) return;
    const tick = (): void => {
      const gone = nightGone(host.msToNextDay());
      night.current?.style.setProperty('--gone', String(gone));
      if (host.today() !== view.day) setNewDay(true);
    };
    tick();
    const timer = setInterval(tick, MOON_MS);
    return () => clearInterval(timer);
  }, [host, view.day, newDay]);

  const fed = record?.fed ?? view.fed;
  return (
    <section className="kindy-done" aria-label="Done for today">
      {revealing && <StickerReveal host={host} profile={profile} catalogue={catalogue} kindy onGone={() => setRevealing(false)} />}
      <div className={`kindy-sun${newDay ? ' awake' : ''}`}>
        <Icon className="pic" name={newDay ? 'sun' : 'sleepy-sun'} label={newDay ? 'The sun is up: a new puzzle' : 'The sun is asleep until tomorrow'} />
      </div>
      {!newDay && (
        <div className="kindy-night" ref={night} role="img" aria-label="Time until the next puzzle">
          <span className="kindy-night-sky" aria-hidden="true" />
          <Icon className="pic kindy-moon" name="moon" />
          <Icon className="pic kindy-sunrise" name="sunrise" />
        </div>
      )}
      <ol className="kindy-fed" aria-label="Kids fed today">
        {Array.from({ length: fed }, (_, i) => (
          <li key={i}>
            <KidHead className="pic" id={i + 1} mood="yum" />
          </li>
        ))}
      </ol>
      <ol className="kindy-week" aria-label="The last seven days">
        {weekStrip(profile.recent, view.day).map((d) => (
          <li key={d.day} className={d.done ? 'on' : ''} aria-label={d.done ? 'finished' : 'not finished'}>
            {d.done && <Icon className="pic" name="star" />}
          </li>
        ))}
      </ol>
      <div className="kindy-done-actions">
        {newDay && (
          <button type="button" className="kindy-btn kindy-go kindy-today" aria-label="Play today" onClick={() => void host.daily()}>
            <span className="kindy-go-arrow" aria-hidden="true" />
          </button>
        )}
        <button type="button" className="kindy-btn kindy-again" aria-label="Practice board" onClick={() => void host.practice()}>
          <Icon className="pic" name="again" />
        </button>
        <button type="button" className="kindy-btn kindy-book" aria-label="Sticker book" onClick={openBook}>
          <Icon className="pic" name="book" />
        </button>
      </div>
    </section>
  );
}

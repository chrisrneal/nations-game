import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Catalogue, ProfileView } from '@snacks/contracts';
import type { GameHost } from '../platform/index.ts';
import { Avatar } from './Avatar.tsx';
import { Icon } from './art/Icons.tsx';
import { StickerArt } from './art/Stickers.tsx';
import { revealItems, type RevealItem } from './book.ts';

/** How long the reveal stays up by itself before it puts itself away, in ms: each item pops 350 ms after the last. */
export const revealMs = (items: number): number => 2600 + 350 * Math.max(0, items - 1);

/**
 * The reveal on done for today (RULES 9a, K12): what the child just earned
 * pops out over the screen. It puts itself away after a moment, and a tap
 * anywhere skips it. Either way the host is told it has been seen, so it
 * plays once. CSS does the animation (P7); with reduced motion it simply
 * shows, still, for the same time.
 */
export function StickerReveal(props: { host: GameHost; profile: ProfileView; catalogue: Catalogue; kindy: boolean; onGone: () => void }): ReactElement | null {
  const { host, profile, catalogue, kindy, onGone } = props;
  // What to show is fixed when the screen opens: marking it seen must not empty the reveal mid-animation.
  const [shown] = useState<readonly RevealItem[]>(() => revealItems(profile, catalogue));
  const done = useRef(false);
  const finish = (): void => {
    if (done.current) return;
    done.current = true;
    void host.seeStickers();
    onGone();
  };
  useEffect(() => {
    if (shown.length === 0) return;
    const timer = setTimeout(finish, revealMs(shown.length));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish only reads refs and props that are fixed while the reveal is up
  }, []);
  if (shown.length === 0) return null;
  return (
    <button type="button" className={`reveal${kindy ? ' reveal-kindy' : ''}`} aria-label={kindy ? 'New sticker' : 'New sticker. Tap to skip'} data-reveal-count={shown.length} onClick={finish}>
      <span className="reveal-glow" aria-hidden="true" />
      <span className="reveal-sparkles" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Icon key={i} className="reveal-spark" name="sparkle" />
        ))}
      </span>
      {!kindy && <span className="reveal-head">{shown.some((s) => s.kind === 'cosmetic') ? 'You earned something new!' : 'You earned a sticker!'}</span>}
      <span className="reveal-items">
        {shown.map((item, i) => (
          <span key={`${item.kind}-${item.id}`} className="reveal-item" style={{ ['--i' as string]: i }} data-reveal-item={item.id}>
            {item.kind === 'sticker' ? (
              <StickerArt id={item.id} className="reveal-sticker" />
            ) : (
              <Avatar id={profile.avatar} size={kindy ? 132 : 120} worn={catalogue.cosmetics.find((c) => c.id === item.id)?.slot === 'hat' ? { hat: item.id, outfit: null } : { hat: null, outfit: item.id }} />
            )}
            {!kindy && (
              <span className="reveal-name">
                {item.name}
                <span className="reveal-note">{item.note}</span>
              </span>
            )}
          </span>
        ))}
      </span>
      {!kindy && <span className="reveal-skip">Tap to skip</span>}
    </button>
  );
}

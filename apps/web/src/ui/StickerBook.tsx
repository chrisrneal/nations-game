import { useState, type ReactElement } from 'react';
import type { CosmeticDef, HomeView, ProfileView } from '@snacks/contracts';
import type { GameHost } from '../platform/index.ts';
import { Avatar } from './Avatar.tsx';
import { Icon } from './art/Icons.tsx';
import { StickerArt } from './art/Stickers.tsx';
import { bookCount, bookPages, earnText, pageStickers, turnPage } from './book.ts';

/**
 * The sticker book (RULES 9a, K12): one profile's own pages, earned stickers
 * in colour and the rest as silhouettes, and the hats and outfits earned at
 * streak milestones, which go on that child's own avatar and nowhere else.
 * A Kindy child gets the same book with pictures only: arrows and dots to
 * turn pages, a house to go back, no words.
 */
export function StickerBook(props: { host: GameHost; home: HomeView; profile: ProfileView; onClose: () => void }): ReactElement {
  const { host, home, profile, onClose } = props;
  const kindy = profile.mode === 'kindy';
  const catalogue = home.catalogue;
  const pages = bookPages(profile.mode, catalogue);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const page = pages[Math.min(index, pages.length - 1)];
  const owned = new Set(profile.stickers.map((s) => s.id));
  const { earned, total } = bookCount(profile, catalogue);
  const turn = (by: 1 | -1): void => setIndex(turnPage(index, by, pages.length));

  const wear = async (def: CosmeticDef): Promise<void> => {
    const on = profile.worn[def.slot] === def.id;
    setNote(await host.equip(def.slot, on ? null : def.id));
  };

  return (
    <section className={`book${kindy ? ' book-kindy' : ''}`} role="dialog" aria-modal="true" aria-label="Sticker book">
      <header className="book-bar">
        {kindy ? (
          <button type="button" className="kindy-btn book-back" aria-label="Back" onClick={onClose}>
            <Icon className="pic" name="house" />
          </button>
        ) : (
          <button type="button" className="btn book-back" onClick={onClose}>
            Back
          </button>
        )}
        {!kindy && <h2 className="book-title">Sticker book</h2>}
        <div className="book-me" data-worn={[profile.worn.hat, profile.worn.outfit].filter((x) => x !== null).join(' ')}>
          <Avatar id={profile.avatar} size={kindy ? 72 : 56} worn={profile.worn} />
        </div>
        {!kindy && (
          <span className="book-count" aria-label={`${earned} of ${total} stickers`}>
            {earned}/{total}
          </span>
        )}
      </header>

      {page !== undefined && (
        <>
          <nav className="book-pager" aria-label="Pages">
            {kindy ? (
              <button type="button" className="kindy-btn book-turn" aria-label="Previous page" onClick={() => turn(-1)}>
                <Icon className="pic" name="arrow-left" />
              </button>
            ) : (
              <button type="button" className="btn book-turn" aria-label="Previous page" onClick={() => turn(-1)}>
                <Icon className="book-arrow" name="arrow-left" />
              </button>
            )}
            {kindy ? (
              <ol className="book-dots" aria-label="Which page">
                {pages.map((p, i) => (
                  <li key={p.id} className={i === index ? 'on' : ''} aria-current={i === index ? 'page' : undefined} />
                ))}
              </ol>
            ) : (
              <strong className="book-page-name">
                {page.name} <span className="muted">· page {index + 1} of {pages.length}</span>
              </strong>
            )}
            {kindy ? (
              <button type="button" className="kindy-btn book-turn" aria-label="Next page" onClick={() => turn(1)}>
                <Icon className="pic" name="arrow-right" />
              </button>
            ) : (
              <button type="button" className="btn book-turn" aria-label="Next page" onClick={() => turn(1)}>
                <Icon className="book-arrow" name="arrow-right" />
              </button>
            )}
          </nav>

          <ol className="book-grid" aria-label={kindy ? undefined : `${page.name} stickers`}>
            {pageStickers(catalogue, page.id).map((s) => {
              const have = owned.has(s.id);
              return (
                <li key={s.id} className={have ? 'have' : 'missing'} data-sticker-slot={s.id} data-earned={have ? 'yes' : 'no'}>
                  <StickerArt id={s.id} locked={!have} label={have ? s.name : undefined} />
                  {!kindy && <span className="book-name">{have ? s.name : 'Not yet'}</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <section className="book-wardrobe" aria-label={kindy ? 'Hats and outfits' : undefined}>
        {!kindy && <h3 className="book-wardrobe-title">Hats and outfits</h3>}
        <ul className="book-wear">
          {catalogue.cosmetics.map((def) => {
            const have = profile.cosmetics.some((c) => c.id === def.id);
            const on = profile.worn[def.slot] === def.id;
            const preview = (
              <span className="book-wear-pic">
                <Avatar id={profile.avatar} size={kindy ? 60 : 48} worn={{ hat: def.slot === 'hat' ? def.id : null, outfit: def.slot === 'outfit' ? def.id : null }} />
              </span>
            );
            return (
              <li key={def.id} data-cosmetic-slot={def.id} data-earned={have ? 'yes' : 'no'}>
                {have ? (
                  <button type="button" className={`${kindy ? 'kindy-btn' : 'btn'} book-wear-btn${on ? ' on' : ''}`} aria-pressed={on} aria-label={kindy ? `${def.name}${on ? ', on' : ''}` : undefined} onClick={() => void wear(def)}>
                    {preview}
                    {!kindy && <span className="book-wear-name">{def.name}</span>}
                    {!kindy && <span className="book-wear-state">{on ? 'Wearing' : 'Put on'}</span>}
                  </button>
                ) : (
                  <div className={`book-wear-btn book-wear-locked${kindy ? ' kindy-lock' : ''}`} aria-hidden={kindy ? true : undefined}>
                    {preview}
                    {!kindy && <span className="book-wear-name">{def.name}</span>}
                    {!kindy && <span className="book-wear-state">{earnText(def)}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!kindy && note !== null && (
          <p className="book-note" role="status">
            {note}
          </p>
        )}
      </section>
    </section>
  );
}

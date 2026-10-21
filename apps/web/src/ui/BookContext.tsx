import { createContext, useContext } from 'react';
import type { Catalogue } from '@snacks/contracts';

/** What the screens below the app need about the sticker book: its contents, and how to open it (RULES 9a, K12). */
export interface BookAccess {
  readonly catalogue: Catalogue;
  readonly openBook: () => void;
}

const EMPTY: BookAccess = { catalogue: { pages: [], stickers: [], cosmetics: [] }, openBook: () => undefined };

export const BookContext = createContext<BookAccess>(EMPTY);

export function useBook(): BookAccess {
  return useContext(BookContext);
}

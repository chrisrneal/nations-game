import type { Mode } from './game.ts';

/**
 * Profiles (RULES 12, decision record K7): one per child on a shared phone,
 * each with its own dailies, streak and practice board. Device storage only:
 * no accounts, no server.
 *
 * Every day is a whole number of days since 1970-01-01 on the device's
 * calendar (D18), passed in by the host. Nothing here reads a clock.
 */

/** The placeholder pictures a child knows as theirs (art comes in build step 8). */
export type AvatarId = 'dog' | 'cat' | 'fox' | 'panda' | 'frog' | 'owl' | 'bunny' | 'tiger';

/** One finished daily (RULES 9): the day it was for and how it went. */
export interface DayRecord {
  /** The puzzle's day: the day the run started, even when it finished after midnight. */
  readonly day: number;
  readonly fed: number;
  readonly hungry: number;
  /** Times a failed wave was tried again (D10). */
  readonly retries: number;
  /** Hints used on the way (RULES 8b). They never change the streak. */
  readonly hints: number;
  /** That day's bonus round was won too (D11). It never counts for the streak. */
  readonly bonus: boolean;
}

/** A sticker in the catalogue (RULES 9a). The picture is drawn by the interface from the id. */
export interface StickerDef {
  readonly id: string;
  readonly kind: StickerKind;
  readonly page: string;
  /** In main mode's words. Kindy shows the picture only. */
  readonly name: string;
}

export interface StickerPage {
  readonly id: string;
  readonly kind: StickerKind;
  readonly name: string;
}

/** A hat or outfit in the catalogue. */
export interface CosmeticDef {
  readonly id: string;
  readonly slot: CosmeticSlot;
  /** The streak that earns it (RULES 9a). */
  readonly streak: number;
  readonly name: string;
}

/** Every sticker and cosmetic there is: what the book shows, earned or not. */
export interface Catalogue {
  readonly pages: readonly StickerPage[];
  readonly stickers: readonly StickerDef[];
  readonly cosmetics: readonly CosmeticDef[];
}

/** Where a sticker came from: a finished daily, or that day's bonus round (RULES 9a). */
export type StickerKind = 'daily' | 'bonus';

/** A sticker in a profile's book (RULES 9a, K12). The picture is the catalogue's; this is only that it was earned. */
export interface EarnedSticker {
  readonly id: string;
  readonly kind: StickerKind;
  /** The puzzle's day it was earned on. */
  readonly day: number;
  /** False until the reveal on done-for-today has been shown or skipped. */
  readonly seen: boolean;
}

/** Where a hat or an outfit goes on the player's own avatar. Never on kids or friends (RULES 9a). */
export type CosmeticSlot = 'hat' | 'outfit';

/** A hat or outfit earned at a streak milestone (RULES 9a, K12). */
export interface EarnedCosmetic {
  readonly id: string;
  /** The puzzle's day the milestone was reached. */
  readonly day: number;
  /** The streak that earned it. */
  readonly streak: number;
  readonly seen: boolean;
}

/** What an avatar wears now: at most one hat and one outfit, or nothing. */
export interface Worn {
  readonly hat: string | null;
  readonly outfit: string | null;
}

/** A child's profile, as stored on the device. */
export interface Profile {
  /** `p1`, `p2`...: never reused, so a deleted profile's saves can't be picked up by a new one. */
  readonly id: string;
  /** Optional; the picture is what a child taps. */
  readonly name: string;
  readonly avatar: AvatarId;
  /** Set when the profile is made (RULES 12). */
  readonly mode: Mode;
  /** Finished dailies, one per day, oldest first. */
  readonly history: readonly DayRecord[];
  /** The longest streak this profile has had. */
  readonly best: number;
  /** The save slot this profile is playing (its daily, bonus round or practice board), or null. */
  readonly active: string | null;
  /** This profile's own sticker book, oldest first (RULES 9a). Deleting the profile deletes it. */
  readonly stickers: readonly EarnedSticker[];
  /** Hats and outfits earned at streak milestones, oldest first. */
  readonly cosmetics: readonly EarnedCosmetic[];
  /** What the avatar wears. Looks only: nothing here reaches the game. */
  readonly worn: Worn;
}

/** Every profile on the device: the versioned profile save (S9). */
export interface ProfileBook {
  readonly format: 'snack-attack-profiles';
  readonly version: number;
  /** The number in the next new profile's id. */
  readonly nextId: number;
  readonly profiles: readonly Profile[];
}

/** What a grown-up fills in to make a profile. */
export interface ProfileDraft {
  readonly name: string;
  readonly avatar: AvatarId;
  readonly mode: Mode;
}

/** What a grown-up may change later: the mode stays as it was made (RULES 12). */
export interface ProfileEdit {
  readonly name: string;
  readonly avatar: AvatarId;
}

/** What the interface reads about a profile. */
export interface ProfileView {
  readonly id: string;
  readonly name: string;
  readonly avatar: AvatarId;
  readonly mode: Mode;
  /** Days in a row with the daily finished, up to today (RULES 9). */
  readonly streak: number;
  readonly best: number;
  /** Today's finished daily, or null. The bonus round is open once it is set. */
  readonly today: DayRecord | null;
  /** The last few finished dailies, newest last. */
  readonly recent: readonly DayRecord[];
  readonly stickers: readonly EarnedSticker[];
  readonly cosmetics: readonly EarnedCosmetic[];
  readonly worn: Worn;
  /** Earned but not yet revealed: the done-for-today reveal plays these once. */
  readonly unseen: { readonly stickers: readonly EarnedSticker[]; readonly cosmetics: readonly EarnedCosmetic[] };
}

/** Who is on the device and who is playing. */
export interface HomeView {
  readonly profiles: readonly ProfileView[];
  /** The profile playing now; null while the picker is showing. */
  readonly current: string | null;
  /** Today on this device (D18). */
  readonly day: number;
  /** The pictures a profile can have, in the order to offer them. */
  readonly avatars: readonly AvatarId[];
  /** The sticker book's contents and the hats and outfits, from the sim. */
  readonly catalogue: Catalogue;
}

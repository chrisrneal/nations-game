/**
 * The shared vocabulary of Snack Attack.
 *
 * Types only: no runtime code, no dependencies, no DOM, no Node. Every other
 * package may import this one; this one imports nothing. See CLAUDE.md.
 */
export type { RngState } from './state.ts';
export type { Tunable } from './tunable.ts';
export type {
  Board,
  Checkpoint,
  Clue,
  ClueFact,
  Friend,
  FriendType,
  FriendView,
  GameCommand,
  GameCommandType,
  GameSaveFile,
  GameSpec,
  GameState,
  GameView,
  HintTopic,
  KidEnd,
  KidFeature,
  KidLook,
  KidOnBoard,
  KidOutcome,
  KidView,
  KindyHint,
  Lunchbox,
  MainHint,
  Mode,
  Phase,
  PlacedFriend,
  Puzzle,
  PuzzleKid,
  Round,
  ShopItem,
  SnackEnd,
  SnackHop,
  SnackId,
  SnackInfo,
  SnackTrace,
  SnackTrait,
  SquareKind,
  WaveLayout,
  WaveResult,
} from './game.ts';
export type { AvatarId, Catalogue, CosmeticDef, CosmeticSlot, StickerDef, StickerPage, DayRecord, EarnedCosmetic, EarnedSticker, HomeView, Profile, ProfileBook, ProfileDraft, ProfileEdit, ProfileView, StickerKind, Worn } from './profile.ts';

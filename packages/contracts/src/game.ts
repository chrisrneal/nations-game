/**
 * The shared vocabulary of Snack Attack (docs/RULES.md).
 *
 * Every number is a whole number (S5): cells, facings, beats, points. A cell
 * is a square's index on its board, row by row from the top-left:
 * `cell = y * width + x`.
 */

/** What a square of the board is (RULES 3). Friends stand only on `open`, kids only on `path`. */
export type SquareKind = 'open' | 'path' | 'lunchbox' | 'obstacle' | 'table';

/** The snack pool (RULES 4). */
export type SnackId = 'apple' | 'cookie' | 'banana' | 'cheese' | 'pretzel' | 'grapes';

/** The four things about a snack a clue can point at (RULES 4). */
export type SnackTrait = 'colour' | 'feel' | 'taste' | 'shape';

/** Friend types (RULES 5). Every type but the Nurse throws. */
export type FriendType = 'straight' | 'diagonal' | 'short' | 'bouncer' | 'nurse';

/** Main mode for readers, Kindy mode for a child who does not read yet (RULES 11). */
export type Mode = 'main' | 'kindy';

/** Which puzzle of the day this is (RULES 8, 9). */
export type Round = 'daily' | 'bonus' | 'practice';

export interface Lunchbox {
  readonly cell: number;
  readonly snack: SnackId;
}

export interface Board {
  readonly width: number;
  readonly height: number;
  /** One per square, row by row from the top-left. */
  readonly squares: readonly SquareKind[];
  /** The snack in every lunchbox square, in cell order. */
  readonly lunchboxes: readonly Lunchbox[];
}

/** What a kid looks like; relational clues point at these (RULES 6). */
export interface KidLook {
  /** Shirt colour, 0-5. Sisters wear the same colour. */
  readonly shirt: number;
  readonly hat: boolean;
  readonly glasses: boolean;
  readonly backpack: boolean;
  /** Sisters share a number above 0; 0 is no sister on the board. */
  readonly sister: number;
}

/** A feature a "same as" clue can point at. Backpacks are only for looks. */
export type KidFeature = 'hat' | 'glasses';

/** One fact in a clue (RULES 6). */
export type ClueFact =
  | { readonly kind: 'is'; readonly trait: SnackTrait; readonly value: string }
  | { readonly kind: 'not'; readonly trait: SnackTrait; readonly value: string }
  | { readonly kind: 'same'; readonly feature: KidFeature }
  | { readonly kind: 'notSister' };

/** A kid's clue card: one or two facts (RULES 6). */
export interface Clue {
  readonly facts: readonly ClueFact[];
}

/** A kid in the puzzle: when they arrive, where they stand, what they want. */
export interface PuzzleKid {
  readonly id: number;
  /** The wave they arrive at the start of (1-based). */
  readonly wave: number;
  readonly cell: number;
  readonly wants: SnackId;
  readonly look: KidLook;
  /** Main mode only; Kindy kids show a picture instead. */
  readonly clue: Clue | null;
}

/** A friend placed on the board in a planned setup. */
export interface PlacedFriend {
  readonly type: FriendType;
  readonly cell: number;
  readonly facing: number;
}

/** One wave of a solution the solver found: the friends on the board, and what was bought first. */
export interface WaveLayout {
  readonly wave: number;
  readonly buys: readonly FriendType[];
  readonly friends: readonly PlacedFriend[];
}

/** A whole puzzle for a day (RULES 8): fixed by its seed, the same for everyone. */
export interface Puzzle {
  readonly mode: Mode;
  readonly round: Round;
  /** Day number (days since 1970-01-01 on the device's calendar) for daily and bonus; 0 for practice. */
  readonly day: number;
  /** The seed the generator used (after skipping any it threw away). */
  readonly seed: number;
  readonly board: Board;
  /** Today's snacks: the ones in the lunchboxes. */
  readonly snacks: readonly SnackId[];
  readonly kids: readonly PuzzleKid[];
  readonly waves: number;
  /** Friends in the tray at the start. */
  readonly tray: readonly FriendType[];
  /** Friend types the shop sells today (none in Kindy). */
  readonly shop: readonly FriendType[];
  /** Kids who may go home hungry before the day is lost; Kindy cannot be lost. */
  readonly hungryAllowed: number;
  /** How hard each wave is (RULES 10): friends in the solution plus relational clues. */
  readonly difficulty: readonly number[];
  /** A solution the solver proved works: never shown to the player as such. */
  readonly witness: readonly WaveLayout[];
}

/** A friend the player owns. */
export interface Friend {
  readonly id: number;
  readonly type: FriendType;
  /** Where it stands, or -1 in the tray. */
  readonly cell: number;
  readonly facing: number;
}

/** A kid on the board now. */
export interface KidOnBoard {
  readonly id: number;
  readonly cell: number;
  /** A Nurse healed them once already (RULES 7). */
  readonly healed: boolean;
}

export type Phase = 'setup' | 'won' | 'lost';

/** How a snack's flight ended (RULES 5, 7). */
export type SnackEnd =
  | 'fed' // the right snack, first to reach the kid
  | 'ache' // the wrong snack, first to reach the kid (main mode)
  | 'bounced' // the wrong snack in Kindy mode: the kid shakes their head
  | 'wasted' // reached a kid who already had their snack
  | 'edge' // flew off the board
  | 'blocked' // hit a lunchbox, an obstacle or a table
  | 'dropped' // a Short or Bouncer throw landed on an empty square
  | 'nurse' // a Nurse was in the way
  | 'loop'; // passed more than the pass cap

/** One throw: from a square to where the snack arrived. `to` may be off the board (edge). */
export interface SnackHop {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** Beats the throw took (RULES 7): squares crossed, 2 for a Bouncer hop. */
  readonly beats: number;
  readonly by: FriendType;
}

export interface SnackTrace {
  readonly snack: SnackId;
  /** The friend who took it from the lunchbox. */
  readonly picker: number;
  readonly lunchbox: number;
  readonly hops: readonly SnackHop[];
  /** Total beats from the lunchbox to where it ended. */
  readonly beats: number;
  readonly end: SnackEnd;
  /** The kid it reached, or -1. */
  readonly kid: number;
}

/** What happened to a kid at the end of a wave (RULES 7). */
export type KidEnd = 'happy' | 'healed' | 'hungry' | 'waits';

export interface KidOutcome {
  readonly kid: number;
  readonly end: KidEnd;
  /** They got a tummy ache this wave. */
  readonly ache: boolean;
  /** The snack they ate (fed) or got a tummy ache from; null if none. */
  readonly ate: SnackId | null;
}

/** Everything one wave did, in the order the animation plays it. */
export interface WaveResult {
  readonly wave: number;
  readonly snacks: readonly SnackTrace[];
  readonly kids: readonly KidOutcome[];
  readonly points: number;
  readonly wentHungry: number;
}

/** The state at the start of a wave's setup, restored by a retry (RULES 9). */
export interface Checkpoint {
  readonly wave: number;
  readonly friends: readonly Friend[];
  readonly nextFriendId: number;
  readonly kids: readonly KidOnBoard[];
  readonly points: number;
  readonly hungry: number;
  readonly fed: number;
}

/** What a clue card is about (RULES 8b): a snack trait, or the kid it points at by their hat, glasses or sister. */
export type HintTopic = SnackTrait | KidFeature | 'sister';

/**
 * A main-mode hint (RULES 8b, K9): what the hint button has shown for one
 * kid so far. Worked out from the puzzle's stored solution when the button is
 * pressed, then kept until the next press, Go or a retry.
 */
export interface MainHint {
  /**
   * 1: whose card to solve next and what it is about; 2: also the lunchbox
   * that feeds them; 3: a friend put in place for them, with the right
   * facing. 0: every kid on the board is set to get their snack: press Go.
   */
  readonly tier: 0 | 1 | 2 | 3;
  /** The kid the hint is about; -1 at tier 0. */
  readonly kid: number;
  /** What their card is about (tier 1 on). */
  readonly about: readonly HintTopic[];
  /** The lunchbox square holding their snack, from tier 2; -1 before. */
  readonly lunchbox: number;
  /** Tier 3: the square of the friend this press put in place, or -1 when it took a friend in the way back to the tray. */
  readonly placed: number;
}

/** The whole game: one puzzle being played. */
export interface GameState {
  readonly schemaVersion: number;
  readonly puzzle: Puzzle;
  /** The wave being set up, or the last one played once the day is over. */
  readonly wave: number;
  readonly phase: Phase;
  readonly friends: readonly Friend[];
  readonly nextFriendId: number;
  readonly kids: readonly KidOnBoard[];
  readonly points: number;
  /** Kids who went home hungry today. */
  readonly hungry: number;
  /** Kids fed today. */
  readonly fed: number;
  readonly lastWave: WaveResult | null;
  readonly checkpoint: Checkpoint;
  /** Hints used at each wave (index 0 is wave 1), main mode; a retry keeps them (RULES 8b). */
  readonly hints: readonly number[];
  /** The hint showing now; null once Go or a retry ends the setup. */
  readonly hint: MainHint | null;
}

/** The only way to change a game (S2). Allowed only between waves. */
export type GameCommand =
  | { readonly type: 'place'; readonly friend: number; readonly cell: number; readonly facing: number }
  | { readonly type: 'turn'; readonly friend: number; readonly facing: number }
  | { readonly type: 'toTray'; readonly friend: number }
  | { readonly type: 'buy'; readonly friend: FriendType }
  | { readonly type: 'go' }
  | { readonly type: 'retry' }
  /** Main mode, during setup: the next tier of hint (RULES 8b). Tier 3 places a friend itself. */
  | { readonly type: 'hint' };

export type GameCommandType = GameCommand['type'];

/** How to make a new game. */
export interface GameSpec {
  readonly mode: Mode;
  readonly round: Round;
  /** Day number for daily and bonus. */
  readonly day: number;
  /** Seed for practice; ignored for daily and bonus (they derive theirs from the day). */
  readonly seed: number;
}

/** A save (S9): the starting state, every command since, and the hash of where they lead. */
export interface GameSaveFile {
  readonly format: 'snack-attack-save';
  readonly schemaVersion: number;
  readonly snapshot: GameState;
  readonly log: readonly GameCommand[];
  readonly hash: string;
}

/** A snack's facts, for the legend the player reads clues against. */
export interface SnackInfo {
  readonly id: SnackId;
  readonly name: string;
  readonly colour: string;
  readonly feel: string;
  readonly taste: string;
  readonly shape: string;
}

export interface FriendView {
  readonly id: number;
  readonly type: FriendType;
  readonly cell: number;
  readonly facing: number;
  /** Where its next throw lands (RULES D12): a cell, or -1 off the board; -1 for a Nurse. */
  readonly target: number;
  /** It stands next to a lunchbox and picks up from it. */
  readonly picker: boolean;
}

export interface KidView {
  readonly id: number;
  readonly cell: number;
  /** A letter to tell kids apart: A, B, C... */
  readonly label: string;
  readonly look: KidLook;
  /** Main mode: the clue card's text. */
  readonly clue: string | null;
  /** Kindy mode: the snack pictured over their head. Never set in main mode. */
  readonly wants: SnackId | null;
  readonly healed: boolean;
}

export interface ShopItem {
  readonly type: FriendType;
  readonly price: number;
  readonly canBuy: boolean;
}

/**
 * The next step towards feeding the kids on a Kindy board (RULES 11, K8): what
 * a hint's pointing hand shows. Worked out from the puzzle's stored solution,
 * or, once a kid is left waiting, from the solver. Kindy only.
 */
export type KindyHint =
  /** Tap this friend (in the tray or on the board), then this square. */
  | { readonly kind: 'place'; readonly friend: number; readonly cell: number }
  /** Tap the square that makes this friend throw this way. */
  | { readonly kind: 'aim'; readonly friend: number; readonly facing: number }
  /** This friend is in the way: back to the tray. */
  | { readonly kind: 'tray'; readonly friend: number }
  /** Everything is ready: press Go. */
  | { readonly kind: 'go' };

/** What the interface reads (S6). It never holds what a main-mode kid wants. */
export interface GameView {
  readonly mode: Mode;
  readonly round: Round;
  readonly day: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly squares: readonly SquareKind[];
  readonly lunchboxes: readonly Lunchbox[];
  readonly snacks: readonly SnackInfo[];
  readonly wave: number;
  readonly waves: number;
  readonly phase: Phase;
  readonly points: number;
  readonly hungry: number;
  readonly hungryAllowed: number;
  readonly fed: number;
  readonly friends: readonly FriendView[];
  readonly kids: readonly KidView[];
  readonly shop: readonly ShopItem[];
  /** A snack would loop until the pass cap drops it (RULES D12). */
  readonly loopWarning: boolean;
  readonly lastWave: WaveResult | null;
  /** Facings each friend type may take, in turning order. */
  readonly facings: Readonly<Record<FriendType, readonly number[]>>;
  /** Kindy only, during setup: the next step a hint shows. Always null in main mode. */
  readonly hint: KindyHint | null;
  /** Main mode, during setup: the hint the player asked for. The only place the View says which snack a kid wants before they eat (tier 2, K9). */
  readonly mainHint: MainHint | null;
  /** Hints used at each wave (index 0 is wave 1). */
  readonly hints: readonly number[];
}

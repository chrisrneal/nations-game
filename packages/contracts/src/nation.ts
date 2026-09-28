/**
 * Identity of one nation, stable for the whole life of a game.
 *
 * Multiplayer need: a save file, a server and several clients must agree which
 * nation a number refers to. Array indexes and display names both drift (rosters
 * change, names get localised), so identity is an explicit opaque id instead.
 * The brand stops a country name or a player id being passed by accident.
 *
 * Convention: exactly one place per package may cast a raw string to NationId
 * (roster loading in the sim). Do not scatter `as NationId` casts.
 */
export type NationId = string & { readonly __brand: 'NationId' };

/**
 * A tick count, never a wall-clock time.
 *
 * Multiplayer need: the host owns the clock, the sim only counts ticks (seam 4).
 * Catching up after an absence means running N more ticks, which must give the
 * same result on a phone that was asleep and on a server that never slept.
 */
export type Tick = number;

/**
 * Who is answering for a nation right now.
 *
 * Multiplayer need: an async game of days to weeks will have players who go
 * quiet. `caretaker` lets the AI run a human's nation from their standing
 * policies without ending the game or handing anyone an advantage, and the slot
 * is switchable mid-game when they come back (seam 7).
 */
export type ControllerSlot = 'human' | 'ai' | 'caretaker';

import type { NationId, Tick } from './nation.ts';

/**
 * Something the sim decided, emitted by the step for UI, logs and recaps.
 *
 * Multiplayer need: clients render what happened without ever reading State.
 * `audience` is the filter that makes that safe - an event visible only to the
 * nations listed in it never reaches anyone else's device, so a secret deal
 * stays secret (seam 6). An empty audience means public to all nations.
 *
 * Events are derived data: they are rebuilt by replaying the command log, so
 * they are never the source of truth and never need migrating on their own.
 */
export interface Event<TType extends string = string, TPayload = unknown> {
  readonly tick: Tick;
  readonly type: TType;
  readonly payload: TPayload;
  readonly audience: readonly NationId[];
}

/** Alias for UI code, where the DOM's own `Event` type is already in scope. */
export type SimEvent<TType extends string = string, TPayload = unknown> = Event<TType, TPayload>;

import type { Command } from './command.ts';
import type { State } from './state.ts';

/**
 * A saved game: a snapshot plus every command since it was taken.
 *
 * Multiplayer need: one format serves four jobs - resume on this device, rebuild
 * authoritative state on a server, replay for a bug report, and feed the balance
 * harness (seam 9). Because commands are the only mutation, snapshot + log
 * replays byte-identically, which is also how save-reload-continue is tested
 * against an uninterrupted run.
 *
 * `schemaVersion` is checked before load and migrated forward; a client and a
 * server on different versions must fail loudly rather than diverge quietly.
 */
export interface SaveFile {
  readonly schemaVersion: number;
  readonly snapshot: State;
  readonly commandLog: readonly Command[];
}

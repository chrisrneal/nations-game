/**
 * Command-line parsing for `npm run harness`. Strict on purpose: an unknown
 * flag or command is an error with a non-zero exit, never silently ignored
 * (Gate 1 review F1: `--suite gate1` used to run the default command).
 */
export const COMMANDS = ['play', 'determinism', 'bench', 'gate1', 'gate2', 'invest', 'predictions'] as const;
export type HarnessCommand = (typeof COMMANDS)[number];

interface FlagSpec {
  readonly numbers: readonly string[];
  readonly strings: readonly string[];
  readonly switches: readonly string[];
  /** Number flags that must be at least 1. */
  readonly positive?: readonly string[];
}

const FLAGS: Record<HarnessCommand, FlagSpec> = {
  play: { numbers: ['games', 'ticks', 'seed'], strings: ['out', 'set'], switches: [] },
  determinism: { numbers: ['seeds', 'ticks'], strings: [], switches: ['no-browser'] },
  bench: { numbers: ['ticks', 'runs'], strings: [], switches: ['no-browser'] },
  gate1: { numbers: ['games', 'seed', 'ranges', 'ticks'], strings: ['out', 'set'], switches: [], positive: ['ranges'] },
  gate2: { numbers: ['games', 'seed', 'ticks', 'absence'], strings: ['out', 'set'], switches: ['no-invest', 'no-rates'], positive: ['games'] },
  invest: { numbers: ['games', 'seed', 'ticks'], strings: ['out', 'set'], switches: ['no-rates'], positive: ['games'] },
  predictions: { numbers: [], strings: ['files', 'dir', 'out'], switches: [] },
};

export interface ParsedArgs {
  readonly command: HarnessCommand;
  readonly numbers: Readonly<Record<string, number>>;
  readonly strings: Readonly<Record<string, string>>;
  readonly switches: readonly string[];
}

const isCommand = (word: string): word is HarnessCommand => (COMMANDS as readonly string[]).includes(word);

/** Parses argv (without node and the script). Throws an Error with a user-facing message. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let command: HarnessCommand | undefined;
  let explicit: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i] as string;
    if (word === '--suite') {
      const suite = argv[i + 1];
      if (suite === undefined || !isCommand(suite)) {
        throw new Error(`Unknown suite "${suite ?? ''}". Use --suite ${COMMANDS.join(', ')}.`);
      }
      if (command !== undefined && command !== suite) throw new Error(`Got both "${command}" and --suite ${suite}; give one.`);
      command = suite;
      i++;
    } else if (i === 0 && !word.startsWith('--')) {
      if (!isCommand(word)) throw new Error(`Unknown harness command "${word}". Use ${COMMANDS.join(', ')}.`);
      command = word;
      explicit = word;
    } else {
      rest.push(word);
    }
  }
  const resolved = command ?? 'play';
  if (explicit !== undefined && explicit !== resolved) throw new Error(`Got both "${explicit}" and --suite ${resolved}; give one.`);
  const spec = FLAGS[resolved];
  const numbers: Record<string, number> = {};
  const strings: Record<string, string> = {};
  const switches: string[] = [];
  const known = [...spec.numbers, ...spec.strings, ...spec.switches].map((f) => `--${f}`).join(', ');
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i] as string;
    if (!word.startsWith('--')) throw new Error(`Unexpected argument "${word}". Flags look like --games 200.`);
    const name = word.slice(2);
    if (spec.switches.includes(name)) {
      switches.push(name);
    } else if (spec.numbers.includes(name)) {
      const value = Number(rest[i + 1]);
      const min = spec.positive?.includes(name) === true ? 1 : 0;
      if (rest[i + 1] === undefined || !Number.isSafeInteger(value) || value < min) {
        throw new Error(`--${name} needs a whole number${min > 0 ? ` of at least ${min}` : ''}.`);
      }
      numbers[name] = value;
      i++;
    } else if (spec.strings.includes(name)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value.`);
      strings[name] = value;
      i++;
    } else {
      throw new Error(`Unknown flag ${word} for "${resolved}". Known flags: ${known || 'none'}.`);
    }
  }
  return { command: resolved, numbers, strings, switches };
}

/**
 * A stand-in for the Web Audio graph, for tests only (nothing in the app imports
 * it). It records what a cue builds: which nodes exist, how they connect, when
 * sources start and stop and what each gain envelope does, so Node tests can
 * check a sound without a speaker.
 */
export interface Event {
  readonly time: number;
  readonly value: number;
}

export class FakeParam {
  value = 0;
  /** The node this parameter belongs to: modulating it counts as reaching it. */
  owner: FakeNode | null = null;
  readonly events: Event[] = [];
  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ time, value });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ time, value });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push({ time, value });
    return this;
  }
  setTargetAtTime(value: number, time: number): this {
    this.events.push({ time, value });
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeNode {
  readonly out: (FakeNode | FakeParam)[] = [];
  started: number | null = null;
  stopped: number | null = null;
  type = 'sine';
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  buffer: unknown = null;
  loop = false;
  constructor(readonly kind: string) {
    for (const param of [this.gain, this.frequency, this.Q, this.threshold, this.knee, this.ratio, this.attack, this.release]) param.owner = this;
  }
  get events(): Event[] {
    return this.gain.events;
  }
  connect<T extends FakeNode | FakeParam>(to: T): T {
    this.out.push(to);
    return to;
  }
  disconnect(): void {
    this.out.length = 0;
  }
  start(when = 0): void {
    this.started = when;
  }
  stop(when = 0): void {
    this.stopped = when;
  }
  /** Does this node's sound reach `target`, through any chain of connections or modulation? */
  reaches(target: FakeNode): boolean {
    const seen = new Set<FakeNode>();
    const walk = (n: FakeNode): boolean => {
      if (n === target) return true;
      if (seen.has(n)) return false;
      seen.add(n);
      return n.out.some((o) => walk(o instanceof FakeParam ? (o.owner ?? n) : o));
    };
    return walk(this);
  }
}

export interface FakeAudio {
  readonly ctx: AudioContext;
  readonly nodes: FakeNode[];
  readonly raw: FakeContext;
}

export class FakeContext {
  state: 'suspended' | 'running' | 'interrupted' | 'closed' = 'suspended';
  currentTime = 0;
  readonly sampleRate = 44100;
  readonly destination = new FakeNode('destination');
  readonly nodes: FakeNode[] = [];
  resumed = 0;
  suspended = 0;
  /** What the browser does with `resume()` outside a gesture (iOS refuses): set false to refuse. */
  allowResume = true;
  private make(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
  createOscillator = (): FakeNode => this.make('oscillator');
  createGain = (): FakeNode => this.make('gain');
  createBiquadFilter = (): FakeNode => this.make('filter');
  createBufferSource = (): FakeNode => this.make('bufferSource');
  createDynamicsCompressor = (): FakeNode => this.make('compressor');
  createBuffer = (_channels: number, length: number): { getChannelData: () => Float32Array } => {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  };
  resume = (): Promise<void> => {
    this.resumed += 1;
    if (this.allowResume) this.state = 'running';
    return Promise.resolve();
  };
  suspend = (): Promise<void> => {
    this.suspended += 1;
    this.state = 'suspended';
    return Promise.resolve();
  };
}

export function fakeAudio(): FakeAudio {
  const raw = new FakeContext();
  return { ctx: raw as unknown as AudioContext, nodes: raw.nodes, raw };
}

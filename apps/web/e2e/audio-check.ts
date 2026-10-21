/**
 * The sound check (decision record K12), in headless Chromium: every cue is
 * rendered offline with the real Web Audio engine, through the same output path
 * the app uses (sounds.ts: makeBus), and measured. A speaker is not needed, so
 * it also runs where the phone check cannot.
 *
 * - every cue is audible, yet gentle (peak below -9 dBFS, the level a quiet room
 *   and a small speaker are both fine with);
 * - it starts and ends in silence (no click), and no sample is not-a-number;
 * - it is over by the time its recipe says (plus a short tail);
 * - the whole set is played back to back into a WAV (`AUDIO_OUT=path`), to
 *   listen to on a computer.
 * Run: `npm run audio --workspace web`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { CUES, MASTER_VOLUME, cueSeconds } from '../src/platform/sounds.ts';

function chromiumPath(): string {
  const candidates = [process.env.CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((c) => c !== undefined && existsSync(c));
  if (found === undefined) throw new Error('No Chromium found; set CHROMIUM=/path/to/chrome');
  return found;
}

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/platform/sounds.ts', import.meta.url))],
  bundle: true,
  format: 'iife',
  globalName: 'Sounds',
  write: false,
});
const code = bundle.outputFiles[0]!.text;

const RATE = 44100;
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: code });
  // Rendered in the page; a string, not a function, so tsx adds no helper the page lacks.
  const rendered = (await page.evaluate(`(async () => {
    const out = {};
    for (const cue of ${JSON.stringify(CUES)}) {
      const seconds = Math.ceil(${Math.max(...CUES.map(cueSeconds))} + 0.5);
      const ctx = new OfflineAudioContext(1, ${RATE} * seconds, ${RATE});
      Sounds.playCue(ctx, Sounds.makeBus(ctx), cue, 0.05);
      const buffer = await ctx.startRendering();
      out[cue] = Array.from(buffer.getChannelData(0), (x) => Math.round(x * 32767));
    }
    return out;
  })()`)) as Record<string, number[]>;

  const all: number[] = [];
  for (const cue of CUES) {
    const samples = rendered[cue]!;
    const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0) / 32767;
    const db = 20 * Math.log10(Math.max(peak, 1e-6));
    const first = Math.abs(samples[0]!) / 32767;
    const last = samples.length - 1;
    const endsAt = Math.ceil((0.05 + cueSeconds(cue) + 0.06) * RATE);
    const tail = samples.slice(endsAt).reduce((m, x) => Math.max(m, Math.abs(x)), 0) / 32767;
    const bad = samples.some((x) => !Number.isFinite(x));
    check(`${cue}: audible but gentle`, peak > 0.04 && db < -9, `peak ${db.toFixed(1)} dBFS`);
    check(`${cue}: starts silent, is over on time, no bad samples`, first < 0.001 && tail < 0.002 && !bad && last > endsAt, `ends ${(endsAt / RATE).toFixed(2)} s, tail ${tail.toFixed(4)}`);
    // A second of calm between cues, so the preview can be told apart by ear.
    all.push(...samples.slice(0, endsAt), ...new Array<number>(Math.round(RATE * 0.7)).fill(0));
  }
  check('master volume is gentle', MASTER_VOLUME <= 0.8, `${MASTER_VOLUME}`);

  if (process.env.AUDIO_OUT !== undefined) {
    // Mono 16-bit PCM at 44.1 kHz.
    const data = Buffer.alloc(all.length * 2);
    all.forEach((x, i) => data.writeInt16LE(x, i * 2));
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    writeFileSync(process.env.AUDIO_OUT, Buffer.concat([header, data]));
    console.log(`wrote ${process.env.AUDIO_OUT}: ${CUES.join(', ')}`);
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} sound checks passed`);
if (failed.length > 0) process.exitCode = 1;

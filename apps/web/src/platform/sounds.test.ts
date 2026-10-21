import { describe, expect, it } from 'vitest';
import { CUES, MASTER_VOLUME, MAX_CUE_SECONDS, RECIPES, SCALE_HZ, cueSeconds, overlapPeak, playCue, type Cue } from './sounds.ts';
import { fakeAudio } from './fakeAudio.ts';

describe('the sound set (decision record K12)', () => {
  it('has a recipe for every cue the game asks for', () => {
    expect([...CUES].sort()).toEqual(
      ['ache', 'buy', 'catch', 'dance', 'dayWin', 'fed', 'heal', 'hungry', 'lose', 'sticker', 'tap', 'throw', 'waveWin'].sort(),
    );
    for (const cue of CUES) expect(RECIPES[cue].length, cue).toBeGreaterThan(0);
  });

  it('stays in one small scale, so every cue sounds like the same game', () => {
    const near = (hz: number): boolean => SCALE_HZ.some((s) => Math.abs(s - hz) < 0.5);
    for (const cue of CUES) {
      for (const voice of RECIPES[cue]) {
        if (voice.kind !== 'tone') continue;
        expect(near(voice.freq), `${cue} ${voice.freq}`).toBe(true);
        if (voice.to !== undefined) expect(near(voice.to), `${cue} -> ${voice.to}`).toBe(true);
      }
    }
  });

  it('is short, gentle and soft-edged', () => {
    for (const cue of CUES) {
      expect(cueSeconds(cue), cue).toBeLessThanOrEqual(MAX_CUE_SECONDS);
      // Even if every overlapping voice peaked together, the master level keeps it well under -9 dBFS.
      expect(overlapPeak(cue) * MASTER_VOLUME, cue).toBeLessThanOrEqual(0.36);
      for (const v of RECIPES[cue]) {
        expect(v.len, cue).toBeGreaterThan(0.02);
        expect(v.at, cue).toBeGreaterThanOrEqual(0);
        expect(v.peak, cue).toBeGreaterThan(0);
        expect(v.peak, cue).toBeLessThanOrEqual(0.2);
      }
    }
    // The quick sounds really are quick: a tap is a blip, a dance is the longest of the little ones.
    expect(cueSeconds('tap')).toBeLessThan(0.1);
    expect(cueSeconds('catch')).toBeLessThan(0.2);
    expect(cueSeconds('dayWin')).toBeGreaterThan(cueSeconds('waveWin'));
  });

  it('plays a cue through nodes that all end up at the output and all stop', () => {
    for (const cue of CUES) {
      const audio = fakeAudio();
      const bus = audio.raw.createGain();
      bus.connect(audio.raw.destination);
      playCue(audio.ctx, bus as unknown as AudioNode, cue, 1);
      const voices = RECIPES[cue].length;
      const sources = audio.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource');
      expect(sources.length, cue).toBeGreaterThanOrEqual(voices);
      for (const node of sources) {
        expect(node.started, `${cue} started`).not.toBeNull();
        expect(node.stopped, `${cue} stopped`).not.toBeNull();
        expect(node.stopped!, cue).toBeGreaterThan(node.started!);
        expect(node.reaches(bus), `${cue} reaches the bus`).toBe(true);
      }
      // Every envelope starts silent and ends silent: no clicks.
      for (const node of audio.nodes.filter((n) => n.kind === 'gain' && n.events.length > 0)) {
        const first = node.events[0]!;
        const last = node.events[node.events.length - 1]!;
        expect(first.value, cue).toBeLessThan(0.001);
        expect(last.value, cue).toBeLessThan(0.001);
      }
    }
  });

  it('never schedules before the moment it is asked for', () => {
    const audio = fakeAudio();
    const bus = audio.raw.createGain();
    playCue(audio.ctx, bus as unknown as AudioNode, 'dayWin' satisfies Cue, 5);
    for (const node of audio.nodes) {
      if (node.started !== null) expect(node.started).toBeGreaterThanOrEqual(5);
    }
  });
});

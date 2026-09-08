import assert from 'node:assert/strict';
import test from 'node:test';
import engine from 'web-audio-engine';
import fs from 'node:fs';
import { load } from './load-game-module.mjs';
const { BattleAudio } = await load('battle-audio');
let context;
globalThis.window = { AudioContext: class extends engine.RenderingAudioContext {
  constructor() { super({ sampleRate: 22050, numberOfChannels: 2 }); context = this; }
} };
const rms = samples => Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length);

test('all 11 effects render finite, audible, unclipped individual stereo signals', async () => {
  const effects = ['failed', 'rifle', 'cannon', 'artillery', 'missile', 'jet', 'prop', 'blast', 'confirm', 'upgrade', 'alarm'];
  for (const kind of effects) {
    const audio = new BattleAudio(); audio.unlock(); await context.resume();
    audio.play(kind, 100); context.processTo(2.5);
    const data = context.exportAsAudioData();
    assert.ok(data.channelData.every(samples => samples.every(Number.isFinite)), kind);
    assert.ok(rms(data.channelData[0]) > .0001, `${kind} must be audible`);
    let peak = 0; for (const samples of data.channelData) for (const x of samples) peak = Math.max(peak, Math.abs(x));
    assert.ok(peak < 1, `${kind}: individual peak ${peak}`);
    if (!['failed', 'confirm', 'upgrade', 'alarm'].includes(kind)) {
      // Flybys cross the stereo field; check the launch position before they pass.
      const early = Math.floor(data.sampleRate * .3);
      assert.ok(rms(data.channelData[0].slice(0, early)) > rms(data.channelData[1].slice(0, early)) * 1.2, `${kind}: launch position should sound on the left`);
    }
    audio.dispose();
  }
});

test('mute silences active tails and zero volume prevents new effects', async () => {
  const audio = new BattleAudio(); audio.unlock(); await context.resume();
  audio.play('artillery'); context.processTo(.12);
  audio.setEnabled(false); context.processTo(.9);
  assert.ok(rms(context.exportAsAudioData().channelData[0].slice(-4000)) < .00001);
  audio.setEnabled(true); audio.setVolume(0); await context.resume(); audio.play('cannon'); context.processTo(1.8);
  assert.ok(rms(context.exportAsAudioData().channelData[0].slice(-4000)) < .00001);
  audio.dispose();
});

test('dense simultaneous fire remains bounded and sources are released', async () => {
  const audio = new BattleAudio(); audio.unlock(); await context.resume();
  for (let i = 0; i < 100; i++) audio.play('rifle', i * 10);
  assert.ok(audio.voices <= 24);
  context.processTo(3);
  assert.equal(audio.sources.size, 0);
  assert.equal(audio.voices, 0);
  audio.dispose();
});

test('export an offline effects demonstration for listening', async () => {
  const audio = new BattleAudio(); audio.unlock();
  const effects = ['rifle', 'cannon', 'artillery', 'missile', 'jet', 'prop', 'blast', 'upgrade'];
  for (let i = 0; i < effects.length; i++) {
    await context.resume(); audio.play(effects[i], i % 2 ? 800 : 200); context.processTo((i + 1) * 2);
  }
  const wav = await context.encodeAudioData(context.exportAsAudioData());
  fs.writeFileSync(new URL('../outputs/mtd3d-effects-preview.wav', import.meta.url), new Uint8Array(wav));
  audio.dispose();
});

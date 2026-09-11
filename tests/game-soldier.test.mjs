import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { SoldierModels, isSoldier } = await load('soldier-model');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const assetUrl = new URL('../public/assets/soldier/scifi-soldier.glb', import.meta.url);

function assetChunks() {
  const buffer = fs.readFileSync(assetUrl);
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB is complete');
  const length = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  return { json: JSON.parse(buffer.toString('utf8', 20, 20 + length)), binary: buffer.subarray(20 + length) };
}

async function readGeometry() {
  const { json, binary } = assetChunks();
  // Parse the real asset with Three. Browser image decoding is unavailable in
  // Node, so texture files and their glTF/UV bindings are validated separately.
  for (const material of json.materials ?? []) {
    for (const key of Object.keys(material)) if (key.endsWith('Texture')) delete material[key];
    for (const key of Object.keys(material.pbrMetallicRoughness ?? {})) if (key.endsWith('Texture')) delete material.pbrMetallicRoughness[key];
  }
  delete json.images; delete json.textures; delete json.samplers;
  const raw = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20);
  raw.copy(padded);
  const packed = Buffer.alloc(20 + padded.length + binary.length);
  packed.writeUInt32LE(0x46546c67, 0); packed.writeUInt32LE(2, 4); packed.writeUInt32LE(packed.length, 8);
  packed.writeUInt32LE(padded.length, 12); packed.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(packed, 20); binary.copy(packed, 20 + padded.length);
  return new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), '');
}

test('soldier retains the source asset and three textures; walking rigs share surfaces but not poses', async () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(assetUrl)).digest('hex'), 'ccae12e537f0069c72e11bbb9b18c1424c471767557a9a457006267613ee097e');
  const { json } = assetChunks();
  assert.equal(json.images.length, 3);
  assert.equal(json.meshes.reduce((n, m) => n + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0), 33792);
  assert.match(json.asset.extras.author, /Polly Hermiston/);
  const models = new SoldierModels(); await models.load(8, { loadAsync: readGeometry });
  const a = models.create(), b = models.create();
  const bounds = new THREE.Box3().setFromObject(a.root);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).y - 28) < .001);
  assert.ok(Math.abs(bounds.min.y) < .001);
  const mesh = a.root.getObjectByName('Object_4'), other = b.root.getObjectByName('Object_4');
  assert.equal(mesh.geometry, other.geometry); assert.equal(mesh.material, other.material);
  assert.notEqual(mesh.skeleton, other.skeleton);
  const weights = mesh.geometry.getAttribute('skinWeight');
  for (let i = 0; i < weights.count; i++) assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) - 1) < .00001);
  a.walk(5, true); a.root.updateMatrixWorld(true);
  assert.notEqual(a.root.getObjectByName('hip-1').rotation.z, 0);
  assert.ok(Math.abs(b.root.getObjectByName('hip-1').rotation.z) < 1e-8);
  // The rifle is attached only to the stationary upper-body bone.
  const gun = a.root.getObjectByName('Object_6'), gunWeights = gun.geometry.getAttribute('skinWeight');
  for (let i = 0; i < gunWeights.count; i++) assert.equal(gunWeights.getX(i), 1);
  a.walk(5, false); assert.equal(a.root.getObjectByName('hip-1').rotation.z, 0);
  let released = 0; mesh.skeleton.computeBoneTexture(); mesh.skeleton.boneTexture.addEventListener('dispose', () => released++);
  a.release(); a.release(); assert.equal(released, 1); b.release(); models.dispose();
});

test('all enemy foot soldiers are replaced with their original size variants and heading', async () => {
  const soldiers = new SoldierModels(), view = Object.create(Battlefield3D.prototype);
  Object.assign(view, { soldiers, entities: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop() });
  const point = { x: 410, y: 210 };
  view.entity('e0', 'infantry', true, 0, point).model.heading.rotation.y = -.8;
  await soldiers.load(8, { loadAsync: readGeometry });
  for (const [i, kind] of ['infantry', 'swarmling', 'slinger', 'brute'].entries()) {
    const entry = view.entity(`e${i}`, kind, true, 0, point);
    assert.equal(entry.model.root.userData.soldier, true);
    assert.equal(entry.model.heading.scale.x, kind === 'brute' ? 1.25 : kind === 'swarmling' ? .8 : 1);
    if (i === 0) assert.equal(entry.model.heading.rotation.y, -.8);
    assert.deepEqual(entry.model.root.position.toArray(), [-90, 0, -115]);
    entry.model.release();
  }
  for (const kind of ['scout', 'bulwark', 'bomber', 'tank']) assert.equal(isSoldier(kind), false);
  assert.equal(view.entity('ally', 'infantry', false, 0, point).model.root.userData.soldier, undefined);
  soldiers.dispose(); view.workshop.dispose();
});

test('soldier rendering stops walking when blocked, freezes when paused, and releases dead instances', async () => {
  const soldiers = new SoldierModels(); await soldiers.load(4, { loadAsync: readGeometry });
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, { soldiers, entities: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop(), terrainReady: true, hq: { x: 900, y: 300 }, frontIndex: 0, renderer: { render() {} }, renderEffects() {}, drawOverlay() {} });
  const enemy = { id: 1, type: 'infantry', tier: 0, x: 100, y: 200, travelled: 5, lane: 0, segment: 0 };
  const game = { hqDefenseLevel: 0, positions: [], enemies: [enemy], sorties: [], effects: [], gameTime: 1, paused: false };
  view.render(game); const model = view.entities.get('e1').model;
  const hip = model.root.getObjectByName('hip-1'); assert.notEqual(hip.rotation.z, 0);
  const pose = hip.rotation.z; game.paused = true; view.render(game); assert.equal(hip.rotation.z, pose);
  game.paused = false; view.render(game); assert.equal(hip.rotation.z, 0, 'stationary soldiers stop stepping');
  enemy.travelled += 2; view.render(game); assert.notEqual(hip.rotation.z, 0);
  let released = 0; const release = model.release; model.release = () => { released++; release(); };
  enemy.dead = true; view.render(game); assert.equal(released, 1); assert.equal(view.entities.has('e1'), false);
  soldiers.dispose(); view.workshop.dispose();
});

test('soldier load failures and late completion preserve fallback and clean up', async t => {
  t.mock.method(console, 'warn', () => {});
  const failed = new SoldierModels();
  await failed.load(4, { loadAsync: async () => { throw new Error('offline'); } });
  assert.equal(failed.create(), null);
  const late = new SoldierModels(), scene = new THREE.Group(), geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  let count = 0, resolve; geometry.addEventListener('dispose', () => count++);
  const pending = late.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  late.dispose(); resolve({ scene }); await pending;
  assert.equal(late.ready, false); assert.equal(count, 1);
});

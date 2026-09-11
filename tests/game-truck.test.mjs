import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { TruckModels } = await load('truck-model');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const assetUrl = new URL('../public/assets/truck/gurkha.glb', import.meta.url);

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

test('Gurkha retains the complete source and wheels roll around centered axles', async () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(assetUrl)).digest('hex'), '1d6b1bd90ef06a390b647dc547f993f617366f33edde181938170e4159352960');
  const { json } = assetChunks();
  assert.equal(json.images.length, 46);
  assert.equal(json.meshes.reduce((n, m) => n + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0), 38856);
  assert.match(json.asset.extras.author, /Heber Soto/);
  const models = new TruckModels(); await models.load(8, { loadAsync: readGeometry });
  const a = models.create(), b = models.create(), bounds = new THREE.Box3().setFromObject(a.root);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - 44) < .001);
  assert.ok(Math.abs(bounds.min.y) < .001);
  for (let i = 0; i < 4; i++) {
    const wheel = a.root.getObjectByName(`truck-wheel-${i}`);
    assert.ok(wheel && wheel.userData.radius > 1 && wheel.userData.radius < 10);
    const center = wheel.getWorldPosition(new THREE.Vector3());
    const radius = wheel.userData.radius;
    a.roll(radius * Math.PI);
    assert.ok(Math.abs(wheel.rotation.z + Math.PI) < .00001);
    assert.ok(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(center) < .001);
    assert.ok(Math.abs(b.root.getObjectByName(`truck-wheel-${i}`).rotation.z) < 1e-8);
  }
  const body = a.root.getObjectByName('Truck_body_Main_Body_0');
  assert.equal(body.geometry, b.root.getObjectByName('Truck_body_Main_Body_0').geometry);
  assert.equal(body.rotation.z, b.root.getObjectByName('Truck_body_Main_Body_0').rotation.z);
  models.dispose(); assert.equal(models.create(), null);
});

test('only enemy scouts get Gurkhas; late replacement preserves heading and road placement', async () => {
  const trucks = new TruckModels(), view = Object.create(Battlefield3D.prototype);
  Object.assign(view, { trucks, entities: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop() });
  const point = { x: 410, y: 210 };
  const first = view.entity('e1', 'scout', true, 0, point);
  assert.equal(first.model.root.userData.truck, undefined); first.model.heading.rotation.y = -.8;
  await trucks.load(8, { loadAsync: readGeometry });
  const entry = view.entity('e1', 'scout', true, 0, point);
  assert.equal(entry.model.root.userData.truck, true); assert.equal(entry.model.heading.rotation.y, -.8);
  assert.deepEqual(entry.model.root.position.toArray(), [-90, 0, -115]);
  for (const [kind, enemy] of [['bulwark', true], ['siege', true], ['scout', false]]) {
    assert.equal(view.entity(kind, kind, enemy, 0, point).model.root.userData.truck, undefined);
  }
  trucks.dispose(); view.workshop.dispose();
});

test('truck wheel travel freezes during pause and when stationary', async () => {
  const trucks = new TruckModels(); await trucks.load(4, { loadAsync: readGeometry });
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, { trucks, entities: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop(), terrainReady: true, hq: { x: 900, y: 300 }, frontIndex: 0, renderer: { render() {} }, renderEffects() {}, drawOverlay() {} });
  const enemy = { id: 1, type: 'scout', tier: 0, x: 100, y: 200, travelled: 5, lane: 0, segment: 0 };
  const game = { hqDefenseLevel: 0, positions: [], enemies: [enemy], sorties: [], effects: [], gameTime: 1, paused: false };
  view.render(game); const wheel = view.entities.get('e1').model.root.getObjectByName('truck-wheel-0');
  const angle = wheel.rotation.z; view.render(game); assert.equal(wheel.rotation.z, angle);
  game.paused = true; enemy.travelled += 2; view.render(game); assert.equal(wheel.rotation.z, angle);
  game.paused = false; view.render(game); assert.notEqual(wheel.rotation.z, angle);
  trucks.dispose(); view.workshop.dispose();
});

test('truck loading failures and late results preserve fallback and release resources', async t => {
  t.mock.method(console, 'warn', () => {});
  const failed = new TruckModels(); await failed.load(4, { loadAsync: async () => { throw new Error('offline'); } });
  assert.equal(failed.create(), null);
  const late = new TruckModels(), scene = new THREE.Group(), geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  let count = 0, resolve; geometry.addEventListener('dispose', () => count++);
  const pending = late.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  late.dispose(); resolve({ scene }); await pending;
  assert.equal(late.ready, false); assert.equal(count, 1);
});

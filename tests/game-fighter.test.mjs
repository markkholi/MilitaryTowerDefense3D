import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { FighterModels, isFighter } = await load('fighter-model');
const { disposeModelResources } = await load('patriot-model');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const assetUrl = new URL('../public/assets/fighter/f-16d-block-60.glb', import.meta.url);

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

test('F-16 preserves the complete supplied geometry, textures and attribution', async () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(assetUrl)).digest('hex'), '0dbf18dfa7b3b2bf91a0bd1ced45beb158247da165850e611718776c8f1fc9d6');
  const { json } = assetChunks();
  assert.equal(json.images.length, 18);
  assert.equal(json.meshes.reduce((n, m) => n + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0), 61543);
  assert.match(json.asset.extras.author, /Muhamad Mirza Arrafi/);
  const models = new FighterModels();
  await models.load(8, { loadAsync: readGeometry });
  const a = models.create(), b = models.create();
  const bounds = new THREE.Box3().setFromObject(a.root);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - 52) < .001);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < .001);
  // The supplied nose is +Y in OBJ coordinates, transformed by its glTF root.
  const nose = a.root.getObjectByName('Object_5').localToWorld(new THREE.Vector3(0, 7.53835, 1.5));
  assert.ok(nose.x > 25, 'nose points along local +X flight heading');
  a.heading.rotation.y = 1;
  assert.equal(b.heading.rotation.y, 0);
  assert.equal(a.root.getObjectByName('Object_5').geometry, b.root.getObjectByName('Object_5').geometry);
  models.dispose(); assert.equal(models.create(), null);
});

test('fighters replace all three jet sortie roles and preserve heading after loading', async () => {
  const fighters = new FighterModels(), view = Object.create(Battlefield3D.prototype);
  Object.assign(view, { fighters, entities: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop() });
  const point = { x: 410, y: 210 };
  const first = view.entity('s1', 'interceptor', false, 0, point, 70);
  first.model.heading.rotation.y = -.8;
  assert.equal(first.model.root.userData.fighter, undefined);
  await fighters.load(8, { loadAsync: readGeometry });
  for (const [index, kind] of ['interceptor', 'multirole', 'strike'].entries()) {
    const entry = view.entity(`s${index + 1}`, kind, false, 0, point, 70);
    assert.equal(entry.model.root.userData.fighter, true);
    assert.deepEqual(entry.model.root.position.toArray(), [-90, 70, -115]);
    if (index === 0) assert.equal(entry.model.heading.rotation.y, -.8);
  }
  for (const kind of ['gunship', 'bomber', 'air', 'tank']) assert.equal(isFighter(kind), false);
  assert.equal(view.entity('e1', 'bomber', true, 0, point, 57).model.root.userData.fighter, undefined);
  fighters.dispose(); view.workshop.dispose();
});

test('failed and late fighter loads retain fallback and release shared resources', async t => {
  t.mock.method(console, 'warn', () => {});
  const failed = new FighterModels();
  await failed.load(4, { loadAsync: async () => { throw new Error('offline'); } });
  assert.equal(failed.ready, false); assert.equal(failed.create(), null);
  const late = new FighterModels(), scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(geometry, material));
  let disposed = 0, resolve;
  geometry.addEventListener('dispose', () => disposed++);
  const pending = late.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  late.dispose(); resolve({ scene }); await pending;
  assert.equal(late.ready, false); assert.equal(disposed, 1);
  disposeModelResources(new THREE.Group());
});

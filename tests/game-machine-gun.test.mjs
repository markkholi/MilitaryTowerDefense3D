import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { MachineGunModels } = await load('machine-gun-model');
const { disposeModelResources } = await load('patriot-model');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const assetUrl = new URL('../public/assets/machine-gun/auto-turret-machine-gun.glb', import.meta.url);

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

function fakeAsset() {
  const scene = new THREE.Group(), turret = new THREE.Group(), recoil = new THREE.Group(), muzzle = new THREE.Object3D();
  turret.name = 'turret'; recoil.name = 'recoil'; muzzle.name = 'muzzle';
  turret.position.set(2, 12, 0); recoil.position.x = 3; muzzle.position.x = 25;
  recoil.add(muzzle); for(let i=1;i<4;i++){const mouth=muzzle.clone();mouth.name='muzzle-'+i;mouth.position.z=i;recoil.add(mouth);} turret.add(recoil); scene.add(turret);
  const disposed = { geometry: 0, material: 0, texture: 0, image: 0 };
  const image = { width: 16, height: 16, close: () => disposed.image++ };
  const textures = Array.from({ length: 4 }, () => new THREE.Texture(image));
  const material = new THREE.MeshStandardMaterial({ map: textures[0], normalMap: textures[1], roughnessMap: textures[2], metalnessMap: textures[2], aoMap: textures[3] });
  const geometry = new THREE.BoxGeometry(6, 6, 6), mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh); recoil.add(mesh.clone());
  geometry.addEventListener('dispose', () => disposed.geometry++);
  material.addEventListener('dispose', () => disposed.material++);
  textures.forEach(texture => texture.addEventListener('dispose', () => disposed.texture++));
  return { scene, geometry, material, textures, disposed };
}

function viewHarness(machineGuns) {
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, {
    canvas: { getBoundingClientRect: () => ({ left: 40, top: 25, width: 1000, height: 650 }) },
    width: 1000, height: 650, yaw: 0, elevation: .9, zoom: 1, focus: new THREE.Vector3(), frontIndex: 0,
    camera: new THREE.OrthographicCamera(-560, 560, 364, -364, 1, 4000),
    raycaster: new THREE.Raycaster(), ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    entities: new Map(), effectObjects: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop(), machineGuns,
    terrainReady: true, hq: { x: 900, y: 300 }, renderer: { render() {} }, drawOverlay() {},
  });
  view.updateCamera();
  return view;
}

function gameWith(position, gameTime = 10, effects = []) {
  return { hqDefenseLevel: 0, positions: [position], effects, enemies: [], sorties: [], gameTime };
}

function direction(object) {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
}

function assertAim(model, angle) {
  assert.ok(direction(model.muzzle).dot(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))) > .999, 'gun muzzle follows the combat target');
}

test('the supplied machine-gun asset retains indexed geometry, an independent gun rig and complete material maps', async () => {
  const { json, binary } = assetChunks();
  assert.equal(crypto.createHash('sha256').update(binary).digest('hex'), 'f48a263af708530221a37a014d00ce4701cd0d132bf92aa1ea27ba0415e8bb10', 'all original geometry and embedded texture bytes are unchanged');
  assert.equal(json.asset.extras.author, 'NghiaNguyeen (https://sketchfab.com/kiroy2002)');
  assert.match(json.asset.extras.license, /CC-BY-4.0/);
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const material = json.materials[primitive.material], pbr = material.pbrMetallicRoughness;
    assert.ok(pbr?.baseColorTexture, `${material.name} retains its color atlas`);
    assert.ok(material.occlusionTexture && material.normalTexture && pbr.metallicRoughnessTexture, `${material.name} retains all supplied surface maps`);
    assert.equal(material.occlusionTexture.index, pbr.metallicRoughnessTexture.index, 'packed ORM provides AO, roughness and metalness from one texture');
    assert.equal(material.occlusionTexture.texCoord ?? 0, 0, 'AO uses the supplied atlas UVs');
    for (const binding of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture].filter(Boolean)) {
      const image = json.images[json.textures[binding.index].source];
      assert.ok(image.bufferView !== undefined, 'the image is embedded in the GLB');
      const view=json.bufferViews[image.bufferView];
      assert.ok(view.byteLength > 100 && ['image/jpeg','image/png'].includes(image.mimeType));
      assert.ok(primitive.attributes[`TEXCOORD_${binding.texCoord ?? 0}`] !== undefined, `${material.name} provides the UV channel used by its texture`);
    }
  }
  const { scene } = await readGeometry();
  const turret = scene.getObjectByName('turret'), recoil = scene.getObjectByName('recoil'), muzzle = scene.getObjectByName('muzzle');
  assert.ok(turret && recoil && muzzle);
  assert.ok(turret.getObjectById(recoil.id) && recoil.getObjectById(muzzle.id), 'muzzle follows aim and recoil');
  const bounds = new THREE.Box3().setFromObject(scene), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.toArray().every(Number.isFinite));
  assert.ok(size.x > 30 && size.x < 100 && size.y > 10 && size.y < 70 && size.z > 10 && size.z < 75, `fits the battlefield: ${size.toArray()}`);
  assert.ok(Math.abs(bounds.min.y) < .05, 'emplacement rests on the terrain');
  const muzzlePoint = muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(muzzlePoint.x > size.x * .15 && muzzlePoint.y > 5, 'shot origin is at the elevated barrel end');
  assert.ok(direction(muzzle).dot(new THREE.Vector3(1, 0, 0)) > .999, 'neutral muzzle faces gameplay forward');
  let meshes = 0, triangles = 0;
  scene.traverse(node => {
    if (!node.isMesh) return;
    meshes++; assert.ok(node.geometry.index, 'meshes remain indexed'); triangles += node.geometry.index.count / 3;
    for (const name of ['position', 'normal', 'tangent', 'uv']) {
      const attr = node.geometry.getAttribute(name);
      assert.ok(attr, `${node.name} retains ${name}`); assert.ok([...attr.array].every(Number.isFinite), `${node.name} has finite ${name}`);
    }
    const tangents = node.geometry.getAttribute('tangent');
    for (let i = 0; i < tangents.count; i++) {
      assert.ok(Math.abs(Math.hypot(tangents.getX(i), tangents.getY(i), tangents.getZ(i)) - 1) < .001, 'normal-map tangents have unit length');
      assert.equal(Math.abs(tangents.getW(i)), 1, 'tangents retain a valid handedness after UV conversion');
    }
  });
  assert.ok(meshes <= 24, `${meshes} batched draw calls`);
  assert.equal(triangles, 7556, 'all triangles from the supplied GLB asset survive conversion');
  let gunTriangles = 0;
  recoil.traverse(node => { if (node.isMesh) gunTriangles += node.geometry.index.count / 3; });
  assert.equal(gunTriangles, 1512, 'the complete supplied gun assembly participates in recoil');
  disposeModelResources(scene);
});

test('machine-gun clones share resources while each turret, recoil and muzzle flash moves independently', async () => {
  const models = new MachineGunModels(); await models.load(8, { loadAsync: readGeometry });
  const first = models.create(), second = models.create();
  assert.equal(first.muzzles.length, 4); assert.equal(first.flashes.length, 4);
  assert.equal(new Set(first.muzzles.map(m=>m.position.toArray().join())).size, 4, "four distinct barrel mouths");
  assert.ok(first.root.userData.machineGun && second.root.userData.machineGun);
  assert.notEqual(first.turret, second.turret); assert.notEqual(first.barrel, second.barrel);
  const untouchedMuzzle = second.muzzle.getWorldPosition(new THREE.Vector3());
  const firstMeshes = [], secondMeshes = [];
  first.root.traverse(node => { if (node.isMesh) firstMeshes.push(node); });
  second.root.traverse(node => { if (node.isMesh) secondMeshes.push(node); });
  firstMeshes.forEach((mesh, i) => { assert.equal(mesh.geometry, secondMeshes[i].geometry); assert.equal(mesh.material, secondMeshes[i].material); });
  first.heading.rotation.y = .65; first.turret.rotation.y = -1.1; first.barrel.position.x -= 3; first.flash.visible = true;
  assert.equal(second.heading.rotation.y, 0); assert.equal(second.turret.rotation.y, 0);
  assert.equal(second.barrel.position.x, second.barrelRestX); assert.equal(second.flash.visible, false);
  assert.ok(second.muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(untouchedMuzzle) < 1e-9);
  models.dispose();
});

test('machine-gun loading preserves AO and surface detail and disposes shared maps and bitmaps once', async () => {
  const fixture = fakeAsset(), models = new MachineGunModels();
  assert.equal(models.create(), null);
  await models.load(8, { loadAsync: async () => fixture });
  const model = models.create(); assert.ok(model);
  assert.equal(model.barrelRestX, 3, 'authored gun rest is retained');
  assert.ok(fixture.textures.every(texture => texture.anisotropy === 8), 'AO uses the same high-quality filtering as other maps');
  assert.equal(fixture.material.aoMap, fixture.textures[3]); assert.equal(fixture.material.normalMap, fixture.textures[1]);
  assert.equal(fixture.material.roughnessMap, fixture.material.metalnessMap);
  model.root.traverse(node => { if (node.isMesh && node.name !== 'muzzle-flash') assert.ok(node.castShadow && node.receiveShadow); });
  models.dispose(); models.dispose();
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 4, image: 1 });
  assert.equal(models.ready, false); assert.equal(models.create(), null);
});

test('machine-gun failures preserve a playable fallback and malformed or late assets release resources', async t => {
  t.mock.method(console, 'warn', () => {});
  const models = new MachineGunModels();
  await models.load(4, { loadAsync: async () => { throw new Error('asset unavailable'); } });
  assert.equal(models.ready, false); assert.equal(models.create(), null);
  const view = viewHarness(models), fallback = view.entity('p1', 'mg', false, 0, { x: 420, y: 150 });
  assert.ok(fallback.model.root.children.length > 0 && !fallback.model.root.userData.machineGun);
  const malformed = fakeAsset(); malformed.scene.getObjectByName('muzzle').name = 'missing';
  await models.load(4, { loadAsync: async () => malformed });
  assert.equal(models.ready, false);
  assert.deepEqual(malformed.disposed, { geometry: 1, material: 1, texture: 4, image: 1 });
  models.dispose(); view.workshop.dispose();
  const late = new MachineGunModels(), fixture = fakeAsset(); let resolve;
  const pending = late.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  late.dispose(); resolve(fixture); await pending;
  assert.equal(late.ready, false); assert.equal(late.create(), null);
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 4, image: 1 });
});

test('machine-gun late replacement and upgrades preserve off-road placement, aim and camera picking', async () => {
  const models = new MachineGunModels(), view = viewHarness(models), point = { x: 420, y: 150 };
  const state = { buildFamily: 'mg', pointer: point, positions: [] };
  assert.deepEqual(view.placementPreview(state), { point, valid: true }, 'machine-gun placement uses the chosen off-road location');
  assert.equal(view.placementPreview({ ...state, pointer: { x: 100, y: 128 } }).valid, false, 'machine-gun cannot occupy the road');
  assert.equal(view.placementPreview({ ...state, positions: [{ family: 'mg', ...point }] }).valid, false, 'units cannot overlap');
  const initial = view.entity('p7', 'mg', false, 0, point).model; initial.heading.rotation.y = .55;
  await models.load(4, { loadAsync: readGeometry });
  const replacement = view.entity('p7', 'mg', false, 0, point).model;
  assert.ok(replacement.root.userData.machineGun); assert.equal(initial.root.parent, null);
  assert.equal(replacement.heading.rotation.y, .55);
  for (const rank of [0, 1, 3]) {
    const position = { id: 7, family: 'mg', rank, ...point, angle: 1.2 };
    view.render(gameWith(position)); const model = view.entities.get('p7').model;
    assert.ok(model.root.userData.machineGun); assert.equal(model.heading.rotation.y, .55);
    assert.deepEqual(model.root.position.toArray(), [-80, 0, -175]); assert.deepEqual(model.root.userData.point, point);
    assertAim(model, position.angle); assert.equal(model.barrel.position.x, model.barrelRestX);
    const centers = []; model.root.updateMatrixWorld(true);
    model.turret.traverse(node => { if (node.isMesh && node.name !== 'muzzle-flash') centers.push(new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())); });
    for (const action of ['reset', 'left', 'tilt', 'in']) {
      view.control(action);
      assert.ok(centers.some(center => {
        const screen = view.project(center.x + 500, center.z + 325, center.y), picked = view.pointAt(screen.x + 40, screen.y + 25);
        return picked?.x === point.x && picked?.y === point.y;
      }), `elevated gun geometry is selectable after camera ${action}`);
    }
  }
  models.dispose(); view.workshop.dispose();
});

test('machine-gun aiming leaves its base fixed and its tracer starts at the recoiling muzzle', async () => {
  const models = new MachineGunModels(), view = viewHarness(models); await models.load(4, { loadAsync: readGeometry });
  const position = { id: 7, family: 'mg', rank: 0, x: 420, y: 150, angle: -.7 };
  view.render(gameWith(position, 1)); const model = view.entities.get('p7').model;
  const baseMeshes = [];
  model.root.traverse(node => { if (node.isMesh && !model.turret.getObjectById(node.id)) baseMeshes.push(node); });
  assert.ok(baseMeshes.length > 0, 'the fixed base has visible geometry');
  model.root.updateMatrixWorld(true); const baseTransforms = baseMeshes.map(mesh => mesh.matrixWorld.clone());
  for (const angle of [2.8, -2.8, -.7]) {
    position.angle = angle; view.render(gameWith(position, 1)); model.root.updateMatrixWorld(true);
    assertAim(model, angle);
    assert.ok(baseMeshes.every((mesh, i) => mesh.matrixWorld.equals(baseTransforms[i])), 'target changes only rotate the gun mount');
    assert.equal(model.barrel.position.x, model.barrelRestX, 'idle gun stays in its authored position');
  }
  const restMuzzle = model.muzzle.getWorldPosition(new THREE.Vector3());
  const shot = { id: 71, type: 'shot', weapon: 'mg', sourceId: 7, x: position.x, y: position.y, tx: 650, ty: 220, age: 0, duration: .16 };
  view.render(gameWith(position, 1.1, [shot]));
  assert.ok(model.barrel.position.x < model.barrelRestX); assert.equal(model.flash.visible, true);
  const firedMuzzle = model.muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(firedMuzzle.clone().sub(restMuzzle).dot(direction(model.muzzle)) < -.79, 'gun recoils backward along its barrel');
  const points = view.effectObjects.get(shot.id).children[0].geometry.getAttribute('position');
  const origin = new THREE.Vector3().fromBufferAttribute(points, 0);
  assert.ok(origin.distanceTo(firedMuzzle) < 2e-5, 'machine-gun tracer starts at the aimed muzzle instead of the unit center');
  assert.ok(new THREE.Vector3().fromBufferAttribute(points, 1).distanceTo(new THREE.Vector3(150, 13, -105)) < 1e-5);
  position.angle = .9; shot.age = .1; view.render(gameWith(position, 1.2, [shot]));
  assertAim(model, position.angle);
  assert.ok(new THREE.Vector3().fromBufferAttribute(points, 0).distanceTo(origin) < 1e-9, 'fired tracer remains at its launch coordinates when the gun tracks another target');
  view.render(gameWith(position, 2));
  assert.equal(model.barrel.position.x, model.barrelRestX); assert.equal(model.flash.visible, false); assert.equal(view.effectObjects.size, 0);
  models.dispose(); view.workshop.dispose();
});

test('machine-gun shots cycle all four barrels once per shot, regardless of global effect IDs', async () => {
  const models = new MachineGunModels(), view = viewHarness(models);
  await models.load(4, { loadAsync: readGeometry });
  const position = { id: 7, family: 'mg', rank: 0, x: 420, y: 150, angle: .5 };
  const visited = [];
  for (let i = 0; i < 5; i++) {
    // Effects elsewhere in the battle can make shot IDs advance by any amount.
    const shot = { id: 100 + i * 4, type: 'shot', weapon: 'mg', sourceId: 7, x: 420, y: 150, tx: 600, ty: 230, age: 0, duration: .16 };
    view.render(gameWith(position, i + 1, [shot]));
    const model = view.entities.get('p7').model;
    visited.push(model.muzzles.indexOf(model.muzzle));
    assert.equal(model.flashes.filter(f => f.visible).length, 1);
    const origin = new THREE.Vector3().fromBufferAttribute(view.effectObjects.get(shot.id).children[0].geometry.getAttribute('position'), 0);
    assert.ok(origin.distanceTo(model.muzzle.getWorldPosition(new THREE.Vector3())) < 2e-5);
    shot.age = .03; view.render(gameWith(position, i + 1.03, [shot]));
    assert.equal(model.muzzles.indexOf(model.muzzle), visited.at(-1), 'extra frames do not switch barrels');
    shot.age = .1; view.render(gameWith(position, i + 1.1, [shot]));
    assert.equal(model.flashes.filter(f => f.visible).length, 0, 'flash ends after the short firing pulse');
  }
  assert.deepEqual(visited, [0, 1, 2, 3, 0]);
  view.render(gameWith(position, 10));
  models.dispose(); view.workshop.dispose();
});

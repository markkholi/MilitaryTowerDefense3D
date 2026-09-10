import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { ArtilleryModels } = await load('artillery-model');
const { disposeModelResources } = await load('patriot-model');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const assetUrl = new URL('../public/assets/artillery/artillery-military-weapon.glb', import.meta.url);

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
  recoil.add(muzzle); turret.add(recoil); scene.add(turret);
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

function viewHarness(artilleryModels) {
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, {
    canvas: { getBoundingClientRect: () => ({ left: 40, top: 25, width: 1000, height: 650 }) },
    width: 1000, height: 650, yaw: 0, elevation: .9, zoom: 1, focus: new THREE.Vector3(), frontIndex: 0,
    camera: new THREE.OrthographicCamera(-560, 560, 364, -364, 1, 4000),
    raycaster: new THREE.Raycaster(), ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    entities: new Map(), effectObjects: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop(), artilleryModels,
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
  assert.ok(direction(model.muzzle).setY(0).normalize().dot(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))) > .999, 'gun muzzle follows the combat target');
}

test('the supplied artillery asset retains indexed geometry, an independent gun rig and complete material maps', async () => {
  const { json, binary } = assetChunks();
  const expectedImageHashes = ["b20779dda2576bc8582f3949f0aaf19fb6e7ca39c387ecd608535bd0d3ed02b6","2aae3903aee43fd900d3c9eb70b6b5ae56ec5d1ddb28aced5bb91842dd0a44c1","bfba44d03e4b112d5d024d654b413a56b536ef9e03955a155f4dda47aa5f66b9","e51f5c8acc42790a65e47c942b9c173c45eb11e8746a337d2a91edbb4e8c7b0e","57b4b00386c333ef438602706dd1b56c95e6c70f9afa9a64a7eae3b487c154e1","d71d0b365d7b76ea5d010f2c3e6d120c1be142e6b3565e025e68e2764841e4d8","0f27341dbf4f146fc51b3885c28ca2874c575c0f62ef1c5944793ebde7da310a","2638b243dfe62acaa49b42010080da54a8bc6e27cbbd50d6fe3515dc5916d919","5cd6dd974105b2a2832345b1199ccf794f4c085746c51ea584b91e33e71537fa","d4d4d7b04d20a45d2aedb144761d47165ccc06cfd327e84261be0eb4df810f93","fe4c8ad65bad091ecb44d0a090cf8ff96d937e31534425c346922bc9d1a0e2f6","74feb9b3461de6c42fd6bf7526122cd900d0730f8c992807eeb778395d055764","8db60b292947a7fa99b7a8ed68d7748e6c8b5b4af22a745b29804cd249826fc1","b0995b0a790c794e65b803a118cb35eace0b05344bdc563127d35a0e364efd41","616460d14899e554170d88f95bfe26b42ff2e393cc2d1925593b4103b0360553"];
  assert.deepEqual(json.images.map(image=>{const view=json.bufferViews[image.bufferView];return crypto.createHash('sha256').update(binary.subarray(8+(view.byteOffset??0),8+(view.byteOffset??0)+view.byteLength)).digest('hex')}),expectedImageHashes,'all fifteen original texture images remain byte-identical');
  assert.equal(json.asset.extras.author,'Javier Martín Hidalgo (https://sketchfab.com/Jj.Mmhh)');
  assert.match(json.asset.extras.license,/CC-BY-4.0/);
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const material = json.materials[primitive.material], pbr = material.pbrMetallicRoughness;
    assert.ok(pbr?.baseColorTexture, `${material.name} retains its color atlas`);
    assert.ok(material.normalTexture && pbr.metallicRoughnessTexture, `${material.name} retains all supplied surface maps`);
    for (const binding of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture].filter(Boolean)) {
      const image = json.images[json.textures[binding.index].source];
      assert.ok(image.bufferView !== undefined, 'texture is embedded');
      assert.ok(json.bufferViews[image.bufferView].byteLength > 100);
      assert.ok(primitive.attributes[`TEXCOORD_${binding.texCoord ?? 0}`] !== undefined, `${material.name} provides the UV channel used by its texture`);
    }
  }
  const { scene } = await readGeometry();
  const turret = scene.getObjectByName('turret'), recoil = scene.getObjectByName('recoil'), muzzle = scene.getObjectByName('muzzle');
  assert.ok(turret && recoil && muzzle);
  assert.ok(turret.getObjectById(recoil.id) && recoil.getObjectById(muzzle.id), 'muzzle follows aim and recoil');
  const bounds = new THREE.Box3().setFromObject(scene), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.toArray().every(Number.isFinite));
  assert.ok(size.x > 79 && size.x < 81 && size.y > 10 && size.y < 70 && size.z > 10 && size.z < 75, `fits the battlefield: ${size.toArray()}`);
  assert.ok(Math.abs(bounds.min.y) < .05, 'emplacement rests on the terrain');
  const muzzlePoint = muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(muzzlePoint.x > size.x * .15 && muzzlePoint.y > 5, 'shot origin is at the elevated barrel end');
  assert.ok(direction(muzzle).setY(0).normalize().dot(new THREE.Vector3(1,0,0)) > .999, 'neutral muzzle faces gameplay forward');
  assert.ok(direction(muzzle).y > .25 && direction(muzzle).y < .26, 'muzzle follows the authored elevated bore');
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
  assert.equal(triangles, 76884, 'all triangles from the supplied GLB asset survive conversion');
  let gunTriangles = 0;
  recoil.traverse(node => { if (node.isMesh) gunTriangles += node.geometry.index.count / 3; });
  assert.equal(gunTriangles, 5056, 'the complete supplied gun assembly participates in recoil');
  disposeModelResources(scene);
});

test('artillery clones share resources while each turret, recoil and muzzle flash moves independently', async () => {
  const models = new ArtilleryModels(); await models.load(8, { loadAsync: readGeometry });
  const first = models.create(), second = models.create();
  assert.ok(first.root.userData.artillery && second.root.userData.artillery);
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

test('artillery loading preserves AO and surface detail and disposes shared maps and bitmaps once', async () => {
  const fixture = fakeAsset(), models = new ArtilleryModels();
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

test('artillery failures preserve a playable fallback and malformed or late assets release resources', async t => {
  t.mock.method(console, 'warn', () => {});
  const models = new ArtilleryModels();
  await models.load(4, { loadAsync: async () => { throw new Error('asset unavailable'); } });
  assert.equal(models.ready, false); assert.equal(models.create(), null);
  const view = viewHarness(models), fallback = view.entity('p1', 'artillery', false, 0, { x: 420, y: 150 });
  assert.ok(fallback.model.root.children.length > 0 && !fallback.model.root.userData.artillery);
  const malformed = fakeAsset(); malformed.scene.getObjectByName('muzzle').name = 'missing';
  await models.load(4, { loadAsync: async () => malformed });
  assert.equal(models.ready, false);
  assert.deepEqual(malformed.disposed, { geometry: 1, material: 1, texture: 4, image: 1 });
  models.dispose(); view.workshop.dispose();
  const late = new ArtilleryModels(), fixture = fakeAsset(); let resolve;
  const pending = late.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  late.dispose(); resolve(fixture); await pending;
  assert.equal(late.ready, false); assert.equal(late.create(), null);
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 4, image: 1 });
});

test('artillery late replacement and upgrades preserve off-road placement, aim and camera picking', async () => {
  const models = new ArtilleryModels(), view = viewHarness(models), point = { x: 420, y: 150 };
  const state = { buildFamily: 'artillery', pointer: point, positions: [] };
  assert.deepEqual(view.placementPreview(state), { point, valid: true }, 'artillery placement uses the chosen off-road location');
  assert.equal(view.placementPreview({ ...state, pointer: { x: 100, y: 128 } }).valid, false, 'artillery cannot occupy the road');
  assert.equal(view.placementPreview({ ...state, positions: [{ family: 'artillery', ...point }] }).valid, false, 'units cannot overlap');
  const initial = view.entity('p7', 'artillery', false, 0, point).model; initial.heading.rotation.y = .55;
  await models.load(4, { loadAsync: readGeometry });
  const replacement = view.entity('p7', 'artillery', false, 0, point).model;
  assert.ok(replacement.root.userData.artillery); assert.equal(initial.root.parent, null);
  assert.equal(replacement.heading.rotation.y, .55);
  for (const rank of [0, 1, 3]) {
    const position = { id: 7, family: 'artillery', rank, ...point, angle: 1.2 };
    view.render(gameWith(position)); const model = view.entities.get('p7').model;
    assert.ok(model.root.userData.artillery); assert.equal(model.heading.rotation.y, .55);
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

test('artillery aiming leaves its base fixed and its tracer starts at the recoiling muzzle', async () => {
  const models = new ArtilleryModels(), view = viewHarness(models); await models.load(4, { loadAsync: readGeometry });
  const position = { id: 7, family: 'artillery', rank: 0, x: 420, y: 150, angle: -.7 };
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
  const shot = { id: 71, type: 'shot', weapon: 'artillery', sourceId: 7, x: position.x, y: position.y, tx: 650, ty: 220, age: 0, duration: .16 };
  view.render(gameWith(position, 1.1, [shot]));
  assert.ok(model.barrel.position.x < model.barrelRestX); assert.equal(model.flash.visible, true);
  const firedMuzzle = model.muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(firedMuzzle.clone().sub(restMuzzle).dot(direction(model.muzzle)) < -2.9, 'gun recoils backward along its barrel');
  const points = view.effectObjects.get(shot.id).children[0].geometry.getAttribute('position');
  const origin = new THREE.Vector3().fromBufferAttribute(points, 0);
  assert.ok(origin.distanceTo(firedMuzzle) < 2e-5, 'artillery tracer starts at the aimed muzzle instead of the unit center');
  assert.ok(new THREE.Vector3().fromBufferAttribute(points, 1).distanceTo(new THREE.Vector3(150, 13, -105)) < 1e-5);
  position.angle = .9; shot.age = .1; view.render(gameWith(position, 1.2, [shot]));
  assertAim(model, position.angle);
  assert.ok(new THREE.Vector3().fromBufferAttribute(points, 0).distanceTo(origin) < 1e-9, 'fired tracer remains at its launch coordinates when the gun tracks another target');
  view.render(gameWith(position, 2));
  assert.equal(model.barrel.position.x, model.barrelRestX); assert.equal(model.flash.visible, false); assert.equal(view.effectObjects.size, 0);
  models.dispose(); view.workshop.dispose();
});

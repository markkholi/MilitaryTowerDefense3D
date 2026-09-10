import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { AbramsModels } = await load('abrams-model');
const { disposeModelResources } = await load('patriot-model');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const { FRONTS } = await load('game-data');
const assetUrl = new URL('../public/assets/abrams/m1a2-woodland.glb', import.meta.url);

function assetChunks() {
  const buffer = fs.readFileSync(assetUrl);
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'asset is binary glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB is complete');
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  return { json: JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength)), binary: buffer.subarray(20 + jsonLength) };
}

async function readGeometry() {
  const { json, binary } = assetChunks();
  // Use Three's real parser for geometry and transforms. Node cannot decode
  // browser textures; their packaged files and material bindings are checked below.
  for (const material of json.materials ?? []) {
    for (const key of Object.keys(material)) if (key.endsWith('Texture')) delete material[key];
    for (const key of Object.keys(material.pbrMetallicRoughness ?? {})) if (key.endsWith('Texture')) delete material.pbrMetallicRoughness[key];
  }
  delete json.images; delete json.textures; delete json.samplers;
  const raw = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(padded);
  const packed = Buffer.alloc(20 + padded.length + binary.length);
  packed.writeUInt32LE(0x46546c67, 0); packed.writeUInt32LE(2, 4); packed.writeUInt32LE(packed.length, 8);
  packed.writeUInt32LE(padded.length, 12); packed.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(packed, 20); binary.copy(packed, 20 + padded.length);
  return new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), '');
}

function fakeAsset() {
  const scene = new THREE.Group(), turret = new THREE.Group(), recoil = new THREE.Group(), muzzle = new THREE.Object3D();
  turret.name = 'turret'; recoil.name = 'recoil'; muzzle.name = 'muzzle';
  turret.position.set(3, 8, 0); recoil.position.x = 2; muzzle.position.x = 26;
  recoil.add(muzzle); turret.add(recoil); scene.add(turret);
  const disposed = { geometry: 0, material: 0, texture: 0, image: 0 };
  const image = { width: 16, height: 16, close: () => disposed.image++ };
  const textures = [new THREE.Texture(image), new THREE.Texture(image), new THREE.Texture(image)];
  const material = new THREE.MeshStandardMaterial({ map: textures[0], normalMap: textures[1], roughnessMap: textures[2], metalnessMap: textures[2] });
  const geometry = new THREE.BoxGeometry(6, 6, 6), mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh); recoil.add(mesh.clone());
  geometry.addEventListener('dispose', () => disposed.geometry++);
  material.addEventListener('dispose', () => disposed.material++);
  textures.forEach(texture => texture.addEventListener('dispose', () => disposed.texture++));
  return { scene, geometry, material, textures, disposed };
}

function viewHarness(abrams) {
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, {
    canvas: { getBoundingClientRect: () => ({ left: 40, top: 25, width: 1000, height: 650 }) },
    width: 1000, height: 650, yaw: 0, elevation: .9, zoom: 1, focus: new THREE.Vector3(), frontIndex: 0,
    camera: new THREE.OrthographicCamera(-560, 560, 364, -364, 1, 4000),
    raycaster: new THREE.Raycaster(), ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    entities: new Map(), effectObjects: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop(), abrams,
    terrainReady: true, hq: { x: 900, y: 300 }, renderer: { render() {} }, drawOverlay() {},
  });
  view.updateCamera();
  return view;
}

function gameWith(position, gameTime = 10, effects = []) {
  return { hqDefenseLevel: 0, positions: [position], effects, enemies: [], sorties: [], gameTime };
}

function worldDirection(object) {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
}

function assertAim(model, angle) {
  const aim = worldDirection(model.muzzle), target = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  assert.ok(aim.dot(target) > .999, `barrel points toward combat target: ${aim.toArray()}`);
}

test('the supplied Abrams retains detailed indexed geometry, its gun rig, and packaged PBR maps', async () => {
  const { json } = assetChunks();
  assert.ok(json.materials.length > 0);
  const usedMaterials = new Set(json.meshes.flatMap(mesh => mesh.primitives.map(primitive => primitive.material)));
  let texturedSurfaces = 0;
  for (const index of usedMaterials) {
    const material = json.materials[index], pbr = material.pbrMetallicRoughness;
    assert.ok(pbr?.baseColorTexture, `${material.name} retains its source color atlas`);
    if (material.normalTexture || pbr.metallicRoughnessTexture) {
      assert.ok(material.normalTexture && pbr.metallicRoughnessTexture, `${material.name} retains its complete surface detail`);
      texturedSurfaces++;
      assert.notEqual(pbr.baseColorTexture.index, material.normalTexture.index, 'normal detail does not reuse a color atlas');
    } else {
      assert.ok(pbr.roughnessFactor >= .5 && pbr.metallicFactor <= .5, 'painted armor without supplied surface maps has a matte finish');
    }
    for (const binding of [pbr.baseColorTexture, material.normalTexture, pbr.metallicRoughnessTexture].filter(Boolean)) {
      const image = json.images[json.textures[binding.index].source];
      assert.ok(image.uri && !image.uri.startsWith('data:') && !image.uri.includes('..'), 'texture is packaged beside the model');
      assert.ok(fs.statSync(new URL(image.uri, assetUrl)).size > 100, `${image.uri} is present`);
    }
  }
  assert.ok(texturedSurfaces >= 3, 'hull, stowage and tracks retain their separate normal and metallic/roughness maps');
  const { scene } = await readGeometry();
  const turret = scene.getObjectByName('turret'), recoil = scene.getObjectByName('recoil'), muzzle = scene.getObjectByName('muzzle');
  assert.ok(turret && recoil && muzzle, 'the model has independent aiming and recoil transforms');
  assert.ok(turret.getObjectById(recoil.id) && recoil.getObjectById(muzzle.id), 'muzzle follows both aiming and recoil');
  const bounds = new THREE.Box3().setFromObject(scene), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.toArray().every(Number.isFinite));
  assert.ok(size.x > 50 && size.x < 105 && size.y > 10 && size.y < 50 && size.z > 15 && size.z < 60, `tank fits the battlefield: ${size.toArray()}`);
  assert.ok(Math.abs(bounds.min.y) < .05, 'tracks rest on the terrain');
  const muzzlePoint = muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(muzzlePoint.x > size.x * .2 && muzzlePoint.y > 5, 'shot origin is at the front of the raised barrel');
  assert.ok(worldDirection(muzzle).dot(new THREE.Vector3(1, 0, 0)) > .999, 'asset forward matches gameplay aim');
  let meshes = 0, triangles = 0;
  scene.traverse(node => {
    if (!node.isMesh) return;
    meshes++;
    assert.ok(node.geometry.index, 'indexed geometry preserves detail without duplicate triangle data');
    triangles += node.geometry.index.count / 3;
    for (const name of ['position', 'normal', 'uv']) {
      const attr = node.geometry.getAttribute(name);
      assert.ok(attr, `${node.name} has ${name}`);
      assert.ok([...attr.array].every(Number.isFinite), `${node.name} has finite ${name}`);
    }
  });
  assert.ok(meshes <= 24, `${meshes} batched draw calls`);
  assert.ok(triangles > 50000 && triangles < 250000, `${triangles} detailed triangles remain practical`);
  disposeModelResources(scene);
});

test('Abrams instances share geometry while hull, aim, recoil and flash remain independent', async () => {
  const models = new AbramsModels();
  await models.load(8, { loadAsync: readGeometry });
  const first = models.create(), second = models.create();
  assert.ok(first.root.userData.abrams && second.root.userData.abrams);
  assert.notEqual(first.heading, second.heading); assert.notEqual(first.turret, second.turret); assert.notEqual(first.barrel, second.barrel);
  const secondMuzzle = second.muzzle.getWorldPosition(new THREE.Vector3());
  const firstMesh = [], secondMesh = [];
  first.root.traverse(node => { if (node.isMesh) firstMesh.push(node); });
  second.root.traverse(node => { if (node.isMesh) secondMesh.push(node); });
  firstMesh.forEach((mesh, i) => { assert.equal(mesh.geometry, secondMesh[i].geometry); assert.equal(mesh.material, secondMesh[i].material); });
  first.heading.rotation.y = .7; first.turret.rotation.y = -.9; first.barrel.position.x -= 3; first.flash.visible = true;
  assert.equal(second.heading.rotation.y, 0); assert.equal(second.turret.rotation.y, 0);
  assert.equal(second.barrel.position.x, second.barrelRestX); assert.equal(second.flash.visible, false);
  assert.ok(second.muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(secondMuzzle) < 1e-9);
  models.dispose();
});

test('Abrams loading preserves normal and packed surface maps and releases shared resources once', async () => {
  const fixture = fakeAsset(), models = new AbramsModels();
  assert.equal(models.create(), null);
  await models.load(8, { loadAsync: async () => fixture });
  const model = models.create();
  assert.ok(model);
  assert.equal(model.barrelRestX, 2, 'rest position comes from the imported gun rig');
  assert.ok(fixture.textures.every(texture => texture.anisotropy === 8));
  assert.equal(fixture.material.roughnessMap, fixture.material.metalnessMap, 'packed material map remains shared');
  assert.equal(fixture.material.normalMap, fixture.textures[1]);
  model.root.traverse(node => { if (node.isMesh && node.name !== 'muzzle-flash') assert.ok(node.castShadow && node.receiveShadow); });
  models.dispose(); models.dispose();
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 3, image: 1 });
  assert.equal(models.ready, false); assert.equal(models.create(), null);
});

test('failed or malformed Abrams loads retain a playable fallback; late loads release their resources', async t => {
  t.mock.method(console, 'warn', () => {});
  const models = new AbramsModels();
  await models.load(4, { loadAsync: async () => { throw new Error('asset unavailable'); } });
  assert.equal(models.ready, false); assert.equal(models.create(), null);
  const view = viewHarness(models), fallback = view.entity('p1', 'tank', false, 0, { x: 400, y: 300 });
  assert.ok(fallback.model.root.children.length > 0 && !fallback.model.root.userData.abrams);
  const malformed = fakeAsset(); malformed.scene.getObjectByName('muzzle').name = 'missing';
  await models.load(4, { loadAsync: async () => malformed });
  assert.equal(models.ready, false);
  assert.deepEqual(malformed.disposed, { geometry: 1, material: 1, texture: 3, image: 1 }, 'malformed rigs do not leak');
  models.dispose(); view.workshop.dispose();
  const late = new AbramsModels(), fixture = fakeAsset();
  let resolve;
  const pending = late.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  late.dispose(); resolve(fixture); await pending;
  assert.equal(late.ready, false); assert.equal(late.create(), null);
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 3, image: 1 }, 'late decoded images are released with GPU resources');
});

test('road placement, late replacement and upgrades preserve tank placement and independent turret aim', async () => {
  const models = new AbramsModels(), view = viewHarness(models);
  const path = FRONTS[0].paths[0], a = path[1], b = path[2];
  const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tangent = Math.atan2(b.y - a.y, b.x - a.x);
  const preview = view.placementPreview({ buildFamily: 'tank', pointer: point, positions: [] });
  assert.equal(preview.valid, true); assert.ok(Math.hypot(preview.point.x - point.x, preview.point.y - point.y) < 1e-6);
  const initial = view.entity('p7', 'tank', false, 0, point).model;
  assert.ok(Math.abs(initial.heading.rotation.y + tangent) < 1e-8, 'new tank hull follows its road segment');
  initial.heading.rotation.y = .65;
  await models.load(4, { loadAsync: readGeometry });
  const replacement = view.entity('p7', 'tank', false, 0, point).model;
  assert.ok(replacement.root.userData.abrams); assert.equal(initial.root.parent, null);
  assert.equal(replacement.heading.rotation.y, .65);
  assert.deepEqual(replacement.root.position.toArray(), [point.x - 500, 0, point.y - 325]);
  assert.deepEqual(replacement.root.userData.point, point);
  for (const rank of [0, 1, 3]) {
    const position = { id: 7, family: 'tank', rank, ...point, angle: Math.PI / 3 };
    view.render(gameWith(position));
    const model = view.entities.get('p7').model;
    assert.ok(model.root.userData.abrams, 'upgrades keep the supplied asset');
    assert.equal(model.heading.rotation.y, .65, 'upgrades retain hull heading');
    assertAim(model, position.angle);
    assert.equal(model.barrel.position.x, model.barrelRestX, 'idle render leaves the barrel at its authored position');
    const centers = [];
    model.root.updateMatrixWorld(true);
    model.turret.traverse(node => { if (node.isMesh && node.name !== 'muzzle-flash') centers.push(new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())); });
    for (const action of ['reset', 'left', 'tilt', 'in']) {
      view.control(action);
      assert.ok(centers.some(center => {
        const screen = view.project(center.x + 500, center.z + 325, center.y);
        const picked = view.pointAt(screen.x + 40, screen.y + 25);
        return picked?.x === point.x && picked?.y === point.y;
      }), `elevated tank geometry remains selectable after camera ${action}`);
    }
  }
  models.dispose(); view.workshop.dispose();
});

test('a moving Abrams aims separately from its hull and fires from the recoiling muzzle', async () => {
  const models = new AbramsModels(), view = viewHarness(models);
  await models.load(4, { loadAsync: readGeometry });
  const position = { id: 7, family: 'tank', rank: 0, x: 420, y: 300, angle: -.7,
    moving: { from: { x: 360, y: 260 }, to: { x: 480, y: 400 } } };
  view.render(gameWith(position, 1));
  const model = view.entities.get('p7').model;
  const travel = new THREE.Vector3(120, 0, 140).normalize();
  assert.ok(worldDirection(model.heading).dot(travel) > .999, 'hull follows redeployment direction');
  assertAim(model, position.angle);
  assert.equal(model.barrel.position.x, model.barrelRestX);
  const restMuzzle = model.muzzle.getWorldPosition(new THREE.Vector3());
  const shot = { id: 71, type: 'shot', weapon: 'tank', sourceId: 7, x: position.x, y: position.y, tx: 650, ty: 220, age: 0, duration: .12 };
  view.render(gameWith(position, 1.1, [shot]));
  assert.ok(model.barrel.position.x < model.barrelRestX, 'firing retracts the gun');
  assert.equal(model.flash.visible, true);
  const firedMuzzle = model.muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(firedMuzzle.clone().sub(restMuzzle).dot(worldDirection(model.muzzle)) < -2.9, 'recoil moves backward along the aimed barrel');
  const line = view.effectObjects.get(shot.id).children[0], linePoints = line.geometry.getAttribute('position');
  const launch = new THREE.Vector3().fromBufferAttribute(linePoints, 0);
  assert.ok(launch.distanceTo(firedMuzzle) < 1e-5, 'tracer begins at the transformed gun muzzle');
  assert.ok(new THREE.Vector3().fromBufferAttribute(linePoints, 1).distanceTo(new THREE.Vector3(150, 13, -105)) < 1e-5);
  position.x += 12; position.y += 14; position.angle = .9; shot.age = .1;
  view.render(gameWith(position, 1.2, [shot]));
  assertAim(model, position.angle);
  assert.ok(new THREE.Vector3().fromBufferAttribute(linePoints, 0).distanceTo(launch) < 1e-9, 'a fired tracer stays at its launch coordinates after the tank moves');
  view.render(gameWith(position, 2));
  assert.equal(model.barrel.position.x, model.barrelRestX, 'gun returns exactly to its authored rest position');
  assert.equal(model.flash.visible, false); assert.equal(view.effectObjects.size, 0);
  assert.deepEqual(model.root.userData.point, { x: position.x, y: position.y });
  models.dispose(); view.workshop.dispose();
});

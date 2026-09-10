import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { load } from './load-game-module.mjs';

const { PatriotModels, disposeModelResources } = await load('patriot-model');
const { MissileFlight, MISSILE_DURATION, MISSILE_IMPACT_TIME } = await load('missile-flight');
const { Battlefield3D } = await load('battlefield-3d');
const { UnitWorkshop } = await load('unit-models');
const assetUrl = new URL('../public/assets/patriot/mim-104-patriot.glb', import.meta.url);

function assetChunks() {
  const buffer = fs.readFileSync(assetUrl);
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'asset is a binary glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB is complete');
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  return { json: JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength)), binary: buffer.subarray(20 + jsonLength) };
}

async function readGeometry() {
  const { json, binary } = assetChunks();
  // Geometry is parsed by the real GLTFLoader. Texture file references are
  // checked separately; Node has no browser image decoder or WebGL context.
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
  const scene = new THREE.Group(), launcher = new THREE.Group(), origin = new THREE.Object3D();
  launcher.name = 'launcher'; origin.name = 'launch-origin'; origin.position.set(3, 4, 0);
  launcher.add(origin); scene.add(launcher);
  const disposed = { geometry: 0, material: 0, texture: 0, image: 0 };
  const image = { width: 16, height: 16, close: () => disposed.image++ };
  const texture = new THREE.Texture(image), roughnessTexture = new THREE.Texture(image);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: roughnessTexture });
  const geometry = new THREE.BoxGeometry(6, 6, 6);
  const mesh = new THREE.Mesh(geometry, material); launcher.add(mesh, mesh.clone());
  for (const [name, resource] of Object.entries({ geometry, material, texture })) resource.addEventListener('dispose', () => disposed[name]++);
  roughnessTexture.addEventListener('dispose', () => disposed.texture++);
  return { scene, geometry, material, texture, disposed };
}

function viewHarness(patriots) {
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, {
    canvas: { getBoundingClientRect: () => ({ left: 40, top: 25, width: 1000, height: 650 }) },
    width: 1000, height: 650, yaw: 0, elevation: .9, zoom: 1, focus: new THREE.Vector3(),
    camera: new THREE.OrthographicCamera(-560, 560, 364, -364, 1, 4000),
    raycaster: new THREE.Raycaster(), ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    entities: new Map(), effectObjects: new Map(), scene: new THREE.Scene(), workshop: new UnitWorkshop(), patriots,
    terrainReady: true, hq: { x: 900, y: 300 }, renderer: { render() {} }, drawOverlay() {},
  });
  view.updateCamera();
  return view;
}

test('the supplied Patriot GLB has finite indexed geometry, a launch rig and packaged textures', async () => {
  const { json } = assetChunks();
  assert.ok(json.images.length >= 2, 'the original body and wheel atlases are retained');
  for (const image of json.images) {
    assert.ok(image.uri && !image.uri.startsWith('data:') && !image.uri.includes('..'), 'texture stays beside asset');
    assert.ok(fs.statSync(new URL(image.uri, assetUrl)).size > 100, `${image.uri} is packaged`);
  }
  const rubber = json.materials.find(material => material.name === 'Worn rubber');
  const wheelTexture = json.textures[rubber.pbrMetallicRoughness.baseColorTexture.index];
  assert.equal(json.images[wheelTexture.source].uri, 'patriot-wheels.png', 'wheel geometry uses its separate atlas');
  const { scene } = await readGeometry();
  const launcher = scene.getObjectByName('launcher'), origin = scene.getObjectByName('launch-origin');
  assert.ok(launcher && origin, 'aim and launch transforms are present');
  assert.ok(launcher.getObjectById(origin.id), 'launch origin follows launcher');
  const bounds = new THREE.Box3().setFromObject(scene), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.toArray().every(Number.isFinite));
  assert.ok(size.x > 35 && size.x < 120 && size.y > 10 && size.y < 90 && size.z > 10 && size.z < 100, `fits battlefield: ${size.toArray()}`);
  assert.ok(bounds.min.y >= -.01 && bounds.min.y < 3, 'wheels and stabilizers rest on the terrain');
  let meshes = 0, triangles = 0, wheelHubUv = false;
  scene.traverse(node => {
    if (!node.isMesh) return;
    meshes++;
    assert.ok(node.geometry.index, 'indexed meshes avoid repeated vertex data');
    triangles += node.geometry.index.count / 3;
    for (const name of ['position', 'normal', 'uv']) {
      const attr = node.geometry.getAttribute(name);
      assert.ok(attr, `${node.name} retains ${name}`);
      assert.ok([...attr.array].every(Number.isFinite), `${node.name} has finite ${name}`);
    }
    if (node.material.name === 'Worn rubber') {
      const uv = node.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        // Known hub center from the supplied OBJ: bottom-origin V=.266113.
        // glTF samples top-origin V=.733887; omitting that conversion mirrors
        // all weathering and moves the wheel hub into the wrong atlas region.
        if (Math.abs(uv.getX(i) - .734375) < .00001 && Math.abs(uv.getY(i) - .733887) < .00001) wheelHubUv = true;
      }
    }
  });
  assert.ok(wheelHubUv, 'wheel hub UVs retain the atlas orientation after conversion');
  assert.ok(meshes <= 20, `static pieces are batched: ${meshes} draws`);
  assert.ok(triangles > 1000 && triangles < 200000, `detailed asset remains practical: ${triangles} triangles`);
  disposeModelResources(scene);
});

test('Patriot instances aim independently while sharing asset resources', async () => {
  const fixture = fakeAsset(), models = new PatriotModels();
  assert.equal(models.create(), null, 'procedural model is used before loading');
  await models.load(8, { loadAsync: async () => fixture });
  const first = models.create(), second = models.create();
  assert.ok(first.root.userData.patriot && second.root.userData.patriot);
  assert.notEqual(first.turret, second.turret);
  first.turret.rotation.y = 1.25; first.heading.rotation.y = .4;
  assert.equal(second.turret.rotation.y, 0); assert.equal(second.heading.rotation.y, 0);
  assert.notEqual(first.launchOrigin.getWorldPosition(new THREE.Vector3()).x, second.launchOrigin.getWorldPosition(new THREE.Vector3()).x);
  const meshes = [];
  first.root.traverse(node => { if (node.isMesh) meshes.push(node); });
  for (const mesh of meshes) {
    assert.equal(mesh.geometry, fixture.geometry); assert.equal(mesh.material, fixture.material);
    assert.ok(mesh.castShadow && mesh.receiveShadow);
  }
  assert.equal(fixture.texture.anisotropy, 8);
  models.dispose(); models.dispose();
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 2, image: 1 }, 'shared decoded image is closed once across distinct textures and cloned meshes');
  assert.equal(models.ready, false); assert.equal(models.create(), null);
});

test('failed loads retain the playable fallback and late loads cannot resurrect disposed assets', async t => {
  t.mock.method(console, 'warn', () => {});
  const failed = new PatriotModels();
  await failed.load(4, { loadAsync: async () => { throw new Error('asset unavailable'); } });
  assert.equal(failed.ready, false); assert.equal(failed.create(), null);
  const view = viewHarness(failed), fallback = view.entity('p1', 'air', false, 0, { x: 400, y: 300 });
  assert.ok(fallback.model.root.children.length > 0);
  assert.ok(!fallback.model.root.userData.patriot);
  view.workshop.dispose(); failed.dispose();
  const models = new PatriotModels(), fixture = fakeAsset();
  let resolve;
  const pending = models.load(4, { loadAsync: () => new Promise(done => { resolve = done; }) });
  models.dispose(); resolve(fixture); await pending;
  assert.equal(models.ready, false); assert.equal(models.create(), null);
  assert.deepEqual(fixture.disposed, { geometry: 1, material: 1, texture: 2, image: 1 }, 'late loads release their decoded image as well as GPU resources');
});

test('late replacement and upgrades preserve Patriot placement, aim and elevated picking', async () => {
  const models = new PatriotModels(), view = viewHarness(models);
  const point = { x: 420, y: 260 };
  const initial = view.entity('p7', 'air', false, 0, point).model;
  initial.heading.rotation.y = .65;
  await models.load(4, { loadAsync: readGeometry });
  const replacement = view.entity('p7', 'air', false, 0, point).model;
  assert.ok(replacement.root.userData.patriot); assert.equal(initial.root.parent, null);
  assert.equal(replacement.heading.rotation.y, .65);
  assert.deepEqual(replacement.root.position.toArray(), [-80, 0, -65]);
  assert.deepEqual(replacement.root.userData.point, point);
  for (const rank of [0, 1, 3]) {
    const position = { id: 7, family: 'air', rank, ...point, angle: Math.PI / 3 };
    const game = { hqDefenseLevel: 0, positions: [position], effects: [], enemies: [], sorties: [], gameTime: 10 };
    view.render(game);
    const model = view.entities.get('p7').model;
    model.root.updateMatrixWorld(true);
    assert.ok(model.root.userData.patriot, 'upgrades keep the imported model');
    const direction = new THREE.Vector3(1, 0, 0).applyQuaternion(model.launchOrigin.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(direction.y > .3, 'missile exits the elevated tube');
    assert.ok(Math.abs(Math.atan2(direction.z, direction.x) - position.angle) < .001, 'launcher follows the combat target');
    const candidates = [];
    model.root.traverse(node => { if (node.isMesh) candidates.push(node); });
    const elevated = candidates.map(mesh => new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())).sort((a, b) => b.y - a.y);
    const selected = elevated.some(center => {
      const screen = view.project(center.x + 500, center.z + 325, center.y);
      const picked = view.pointAt(screen.x + 40, screen.y + 25);
      return picked?.x === point.x && picked?.y === point.y;
    });
    assert.ok(selected, 'clicking textured launcher geometry selects its ground position');
  }
  models.dispose(); view.workshop.dispose();
});

test('missiles leave along the tube direction and finish at the airborne target', () => {
  const origin = new THREE.Vector3(-12, 34, 28), direction = new THREE.Vector3(.3, .8, -.5).normalize(), target = new THREE.Vector3(210, 57, -90);
  const flight = new MissileFlight(origin, direction, target), rocket = flight.children[0];
  assert.ok(rocket.position.distanceTo(origin) < 1e-9);
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).dot(direction) > .999);
  for (const progress of [-1, 0, .01, .2, .5, .78, .9, 1, 2]) {
    flight.update(progress); flight.updateMatrixWorld(true);
    flight.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite), `finite transforms at ${progress}`));
  }
  assert.ok(rocket.position.distanceTo(target) < 1e-9);
  assert.equal(rocket.visible, false, 'rocket disappears at impact');
  assert.ok(flight.children.slice(1).every(mesh => mesh.material.opacity === 0), 'exhaust fades completely');
  assert.deepEqual(origin.toArray(), [-12, 34, 28]); assert.deepEqual(target.toArray(), [210, 57, -90], 'input vectors stay unchanged');
  disposeModelResources(flight);
});

test('Patriot impact visuals appear at aircraft altitude only when the missile arrives', () => {
  const models = new PatriotModels(), view = viewHarness(models);
  view.effectGeometry = new THREE.IcosahedronGeometry(1, 1);
  const shot = { id: 1, type: 'shot', weapon: 'air', sourceId: 7, x: 350, y: 300, tx: 600, ty: 260, age: 0, duration: MISSILE_DURATION };
  const hit = { id: 2, type: 'hit', x: 600, y: 260, age: -MISSILE_IMPACT_TIME, duration: .28, altitude: 57 };
  const blast = { id: 3, type: 'blast', x: 600, y: 260, age: -MISSILE_IMPACT_TIME, duration: .46, altitude: 57, radius: 18 };
  const game = { effects: [shot, hit, blast] };
  for (const elapsed of [0, MISSILE_IMPACT_TIME / 2, MISSILE_IMPACT_TIME - .001]) {
    shot.age = elapsed; hit.age = blast.age = elapsed - MISSILE_IMPACT_TIME;
    view.renderEffects(game);
    assert.ok(view.effectObjects.has(shot.id), 'missile is visible while travelling');
    assert.equal(view.effectObjects.has(hit.id), false, 'pending hit has no premature sparks');
    assert.equal(view.effectObjects.has(blast.id), false, 'pending splash has no premature explosion');
  }
  shot.age = MISSILE_IMPACT_TIME; hit.age = blast.age = 0;
  view.renderEffects(game);
  const rocket = view.effectObjects.get(shot.id).children[0].children[0];
  assert.ok(rocket.position.distanceTo(new THREE.Vector3(100, 57, -65)) < 1e-8, 'impact time matches the actual flight endpoint');
  assert.equal(rocket.visible, false, 'rocket disappears as impact particles appear');
  for (const effect of [hit, blast]) {
    const group = view.effectObjects.get(effect.id);
    assert.deepEqual(group.position.toArray(), [100, 57, -65], 'impact uses airborne coordinates');
    assert.ok(group.children.some(mesh => mesh.material.opacity > 0));
    group.updateMatrixWorld(true);
    group.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
  }
  // Repeated renders reuse each effect, and expiry also releases missile meshes.
  view.renderEffects(game); assert.equal(view.effectObjects.size, 3);
  view.renderEffects({ effects: [] }); assert.equal(view.effectObjects.size, 0);
  models.dispose(); view.workshop.dispose(); view.effectGeometry.dispose();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { load } from './load-game-module.mjs';
const data = await load('game-data');
const { UnitWorkshop } = await load('unit-models');
const { Battlefield3D } = await load('battlefield-3d');

test('all 11 original campaigns generate valid finite waves, including endless escalation', () => {
  assert.equal(data.FRONTS.length, 11);
  data.FRONTS.forEach((front, index) => {
    assert.ok(front.paths.length > 0);
    for (let wave = 0; wave < front.waveCount + 100; wave++) {
      const groups = data.waveForFront(index, wave);
      assert.ok(groups.length);
      for (const group of groups) {
        assert.ok(data.ENEMIES[group.type]);
        assert.ok(group.lane >= 0 && group.lane < front.paths.length);
        assert.ok(group.count > 0 && Number.isInteger(group.count));
        const stats = data.enemyStats(group.type, group.tier, front.difficulty);
        assert.ok(Object.values(stats).every(Number.isFinite));
        assert.ok(stats.hp > 0 && stats.speed > 0);
      }
    }
  });
});

test('every unit and upgrade produces volumetric geometry and independent animation', () => {
  const workshop = new UnitWorkshop();
  const kinds = [...data.FAMILY_ORDER, ...Object.keys(data.ENEMIES), 'interceptor', 'multirole', 'strike', 'gunship', 'hq'];
  for (const kind of kinds) for (const rank of [0, 1, 3, 4]) {
    const unit = workshop.create(kind, kind in data.ENEMIES, rank);
    const other = workshop.create(kind, kind in data.ENEMIES, rank);
    unit.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(unit.root).getSize(new THREE.Vector3());
    assert.ok(size.x > 5 && size.y > 5 && size.z > 5, `${kind} has real volume`);
    assert.ok(size.toArray().every(Number.isFinite), `${kind} has finite bounds`);
    assert.notEqual(unit.root, other.root);
    assert.ok(unit.heading);
    if (unit.turret) { unit.turret.rotation.y = 1.2; assert.equal(other.turret.rotation.y, 0); }
    if (unit.flash) { unit.flash.visible = true; assert.equal(other.flash.visible, false); }
    let meshes = 0;
    unit.root.traverse(node => {
      if (node.isMesh) {
        meshes++;
        assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite));
      }
    });
    assert.ok(meshes < 90, `${kind}: static parts are batched (${meshes} draws)`);
  }
  workshop.dispose();
});

function cameraHarness() {
  const view = Object.create(Battlefield3D.prototype);
  Object.assign(view, {
    canvas: { getBoundingClientRect: () => ({ left: 40, top: 25, width: 1000, height: 650 }) },
    width: 1000, height: 650, yaw: 0, elevation: .9, zoom: 1,
    focus: new THREE.Vector3(), camera: new THREE.OrthographicCamera(-560, 560, 364, -364, 1, 4000),
    raycaster: new THREE.Raycaster(), ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), entities: new Map(),
  });
  view.updateCamera();
  return view;
}

test('camera rotation, tilt and zoom preserve precise placement coordinates', () => {
  const view = cameraHarness();
  for (const action of ['reset', 'left', 'left', 'right', 'in', 'tilt', 'in', 'out', 'reset']) {
    view.control(action);
    for (const point of [{ x: 50, y: 60 }, { x: 500, y: 325 }, { x: 925, y: 575 }]) {
      const screen = view.project(point.x, point.y);
      const picked = view.pointAt(screen.x + 40, screen.y + 25, false);
      assert.ok(picked);
      assert.ok(Math.hypot(picked.x - point.x, picked.y - point.y) < .0001);
    }
  }
  assert.equal(view.pointAt(-2000, -2000, false), null, 'off-board clicks do not place a unit');
});

test('clicking elevated 3D hardware selects its actual ground position', () => {
  const view = cameraHarness(), workshop = new UnitWorkshop();
  const model = workshop.create('tank');
  model.root.position.set(0, 0, 0); model.root.userData.point = { x: 500, y: 325 };
  model.root.updateMatrixWorld(true); view.entities.set('p1', { model });
  const screen = view.project(500, 325, 23);
  assert.deepEqual(view.pointAt(screen.x + 40, screen.y + 25), { x: 500, y: 325 });
  workshop.dispose();
});

test('MTD3D has isolated progress and no original deployment identity', () => {
  const source = fs.readFileSync(new URL('../app/game-client.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('military-tower-defense-3d-save-v1'));
  assert.ok(!source.includes('"military-tower-defense-save-v1"'));
  assert.equal(fs.existsSync(new URL('../.openai/hosting.json', import.meta.url)), false);
});

test('placement preview follows the original road, edge and overlap rules', () => {
  const view = cameraHarness(); view.frontIndex = 0;
  const path = data.FRONTS[0].paths[0];
  const point = { x: (path[1].x + path[2].x) / 2, y: (path[1].y + path[2].y) / 2 };
  const state = { buildFamily: 'mg', pointer: point, positions: [] };
  assert.equal(view.placementPreview(state).valid, false, 'MG cannot occupy the road');
  state.buildFamily = 'tank';
  const preview = view.placementPreview(state);
  assert.equal(preview.valid, true, 'tank can occupy the road');
  assert.ok(Math.hypot(preview.point.x - point.x, preview.point.y - point.y) < .001);
  state.positions.push({ ...point, family: 'tank' });
  assert.equal(view.placementPreview(state).valid, false, 'positions cannot overlap');
  state.positions = []; state.buildFamily = 'airbase'; state.pointer = { x: 10, y: 10 };
  assert.equal(view.placementPreview(state).valid, false, 'large airbase respects battlefield edges');
});

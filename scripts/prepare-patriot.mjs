// Prepare the user-supplied Patriot OBJ without altering the source archive.
// Usage: node scripts/prepare-patriot.mjs path/to/model.obj path/to/textures
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const [source, textureDirectory] = process.argv.slice(2);
if (!source || !textureDirectory) throw new Error('Supply the original Patriot OBJ and texture folder.');
const model = new OBJLoader().parse(fs.readFileSync(source, 'utf8'));
const output = path.resolve('public/assets/patriot');
const bodyGroup = 'DrawCall_0273', wheelsGroup = 'DrawCall_0274';
const launcherGroups = new Set(['DrawCall_0292', 'DrawCall_0296', 'DrawCall_0298', 'DrawCall_0305']);
for (const name of [bodyGroup, wheelsGroup, ...launcherGroups]) {
  if (!model.getObjectByName(name)) throw new Error(`Expected source group ${name} is missing.`);
}

// The source already uses Y-up, with the deployed canister mouths facing +X.
// Its 1,022-unit length includes the hitch, and width includes the outriggers.
const bounds = new THREE.Box3().setFromObject(model);
const center = bounds.getCenter(new THREE.Vector3());
const scale = 80 / (bounds.max.x - bounds.min.x);
const normalize = point => new THREE.Vector3(
  (point.x - center.x) * scale,
  (point.y - bounds.min.y) * scale,
  (point.z - center.z) * scale,
);
const sourcePivot = new THREE.Vector3(-211.07, 154.4, .7);
const pivot = normalize(sourcePivot);
const elevation = Math.atan2(39.86, 58.86);
const forward = new THREE.Vector3(Math.cos(elevation), Math.sin(elevation), 0);
const crossAxis = new THREE.Vector3(-forward.y, forward.x, 0);

function components(geometry) {
  const positions = geometry.getAttribute('position');
  const parents = Array.from({ length: positions.count / 3 }, (_, i) => i);
  const vertices = new Map();
  const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => n.toFixed(3)).join(',');
    const face = Math.floor(i / 3);
    if (vertices.has(key)) parents[find(face)] = find(vertices.get(key));
    else vertices.set(key, face);
  }
  const result = new Map();
  for (let face = 0; face < parents.length; face++) {
    const id = find(face);
    if (!result.has(id)) result.set(id, { faces: [], bounds: new THREE.Box3() });
    const component = result.get(id);
    component.faces.push(face);
    for (let v = 0; v < 3; v++) component.bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, face * 3 + v));
  }
  return [...result.values()];
}

const batches = new Map(), mouths = [];
let triangles = 0, mountComponents = 0;
for (const mesh of model.children) {
  if (!mesh.isMesh) continue;
  if (![bodyGroup, wheelsGroup, ...launcherGroups].includes(mesh.name)) throw new Error(`Unexpected source group ${mesh.name}.`);
  const geometry = mesh.geometry;
  const facesByBatch = new Map();
  for (const component of components(geometry)) {
    const b = component.bounds;
    // The source body group also contains the circular turntable and its upper
    // support platform. Both must turn with the launcher and hydraulic rams.
    const mount = mesh.name === bodyGroup && b.min.y > 140 && b.max.y < 220
      && b.min.x < -290 && b.max.x < -110 && b.min.z > -80 && b.max.z < 80;
    if (mount) mountComponents++;
    const section = mount || launcherGroups.has(mesh.name) ? 'launcher' : 'chassis';
    for (const face of component.faces) {
      // The source material 75aec434_dds uses texture_0006; 0d5d4022_dds
      // uses texture_0011. The unattested grayscale texture_0013 is omitted.
      const material = mesh.name === wheelsGroup ? 1 : 0;
      const key = `${section}:${material}`;
      if (!facesByBatch.has(key)) facesByBatch.set(key, []);
      facesByBatch.get(key).push(face);
    }
    if (mesh.name === 'DrawCall_0292') {
      const positions = geometry.getAttribute('position');
      const local = new THREE.Box3();
      for (const face of component.faces) for (let v = 0; v < 3; v++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, face * 3 + v);
        local.expandByPoint(new THREE.Vector3(point.dot(forward), point.dot(crossAxis), point.z));
      }
      const size = local.getSize(new THREE.Vector3());
      // The four main canister shells are distinct connected components.
      if (size.x > 520 && size.x < 540 && size.y > 80 && size.y < 100 && size.z > 80 && size.z < 100) {
        const point = forward.clone().multiplyScalar(local.max.x)
          .addScaledVector(crossAxis, (local.min.y + local.max.y) / 2);
        point.z = (local.min.z + local.max.z) / 2;
        mouths.push(normalize(point).sub(pivot));
      }
    }
  }
  for (const [key, faces] of facesByBatch) {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) throw new Error(`Missing ${name} attribute in ${mesh.name}.`);
      const values = [];
      for (const face of faces) for (let v = 0; v < 3; v++) {
        const i = face * 3 + v;
        if (name === 'position') {
          const point = normalize(new THREE.Vector3().fromBufferAttribute(attribute, i));
          if (key.startsWith('launcher:')) point.sub(pivot);
          values.push(point.x, point.y, point.z);
        } else if (name === 'uv') {
          // OBJ uses bottom-origin V; glTF textures use top-origin V.
          values.push(attribute.getX(i), 1 - attribute.getY(i));
        } else values.push(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
      }
      part.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    }
    triangles += faces.length;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(part);
  }
}
if (mountComponents !== 2 || mouths.length !== 4) throw new Error(`Unexpected rig: ${mountComponents} mount components, ${mouths.length} canisters.`);
mouths.sort((a, b) => Math.abs(a.y - b.y) > 1 ? b.y - a.y : b.z - a.z);

const gltf = {
  asset: { version: '2.0', generator: 'MTD3D Patriot preparation' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'MIM_104_Patriot', children: [1], extras: { source: path.basename(source), triangles, normalizedLength: 80 } },
    { name: 'heading', children: [2, 3] },
    { name: 'chassis', children: [] },
    { name: 'launcher', translation: pivot.toArray(), children: [] },
  ],
  meshes: [], accessors: [], bufferViews: [], buffers: [],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: [{ uri: 'patriot-body.png' }, { uri: 'patriot-wheels.png' }],
  textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
  materials: [
    { name: 'Weathered painted steel', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: .16, roughnessFactor: .82 } },
    { name: 'Worn rubber', pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicFactor: .02, roughnessFactor: .94 } },
  ],
};
for (const [i, mouth] of mouths.entries()) {
  gltf.nodes[3].children.push(gltf.nodes.push({
    name: i ? `launch-origin-${i}` : 'launch-origin',
    translation: mouth.toArray(),
    rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), elevation).toArray(),
  }) - 1);
}

const chunks = []; let byteLength = 0;
function accessor(array, type, size, index = false) {
  const raw = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const offset = byteLength;
  chunks.push(raw); byteLength += raw.length;
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length, target: index ? 34963 : 34962 }) - 1;
  const min = [], max = [];
  for (let c = 0; c < size; c++) {
    let lo = Infinity, hi = -Infinity;
    for (let j = c; j < array.length; j += size) { lo = Math.min(lo, array[j]); hi = Math.max(hi, array[j]); }
    min.push(lo); max.push(hi);
  }
  return gltf.accessors.push({ bufferView: view, componentType: index ? 5123 : 5126, count: array.length / size, type, min, max }) - 1;
}
let vertices = 0;
for (const [key, geometries] of batches) {
  const [section, material] = key.split(':');
  const geometry = mergeVertices(mergeGeometries(geometries), .00001);
  if (geometry.getAttribute('position').count > 65535) throw new Error('Batch exceeds Uint16 index capacity.');
  vertices += geometry.getAttribute('position').count;
  const attributes = {};
  for (const [name, semantic, type, size] of [['position', 'POSITION', 'VEC3', 3], ['normal', 'NORMAL', 'VEC3', 3], ['uv', 'TEXCOORD_0', 'VEC2', 2]]) {
    attributes[semantic] = accessor(new Float32Array(geometry.getAttribute(name).array), type, size);
  }
  const indices = accessor(new Uint16Array(geometry.index.array), 'SCALAR', 1, true);
  const mesh = gltf.meshes.push({ name: `${section}-${gltf.materials[Number(material)].name}`, primitives: [{ attributes, indices, material: Number(material) }] }) - 1;
  gltf.nodes[section === 'launcher' ? 3 : 2].children.push(gltf.nodes.push({ name: gltf.meshes[mesh].name, mesh }) - 1);
}
gltf.buffers.push({ byteLength });
const jsonData = Buffer.from(JSON.stringify(gltf));
const json = Buffer.concat([jsonData, Buffer.alloc((4 - jsonData.length % 4) % 4, 32)]);
const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8);
jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'mim-104-patriot.glb'), Buffer.concat([header, jsonHeader, json, binHeader, binary]));
fs.copyFileSync(path.join(textureDirectory, 'texture_0006.png'), path.join(output, 'patriot-body.png'));
fs.copyFileSync(path.join(textureDirectory, 'texture_0011.png'), path.join(output, 'patriot-wheels.png'));
console.log(JSON.stringify({ triangles, vertices, drawCalls: gltf.meshes.length, geometryBytes: byteLength, bounds: bounds.getSize(new THREE.Vector3()).multiplyScalar(scale).toArray(), pivot: pivot.toArray(), launchOrigins: mouths.map(p => p.toArray()), elevationDegrees: elevation * 180 / Math.PI }, null, 2));

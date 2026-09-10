// Convert the user's M1A2_Woodland USDZ into an indexed, articulated glTF.
// Usage: node scripts/prepare-abrams.mjs path/to/M1A2_Woodland.usdz [python-with-Pillow]
// The supplied archive is read-only. Conversion uses Three's existing USDC parser.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { USDCParser } from 'three/addons/loaders/usd/USDCParser.js';
import { USDComposer } from 'three/addons/loaders/usd/USDComposer.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const [source, python = 'python'] = process.argv.slice(2);
if (!source) throw new Error('Supply the original M1A2_Woodland.usdz archive.');
const archiveBytes = fs.readFileSync(source);
const archive = unzipSync(archiveBytes);
const crate = archive['scene.usdc'];
if (!crate) throw new Error('Expected scene.usdc is missing from the source USDZ.');
const data = new USDCParser().parseData(crate.buffer.slice(crate.byteOffset, crate.byteOffset + crate.byteLength));
const output = path.resolve('public/assets/abrams');
const temporary = path.resolve('outputs/abrams-prepare-source');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(temporary, { recursive: true });

// Image decoding is unnecessary for geometry conversion. Texture nodes retain
// their source filenames, while Pillow handles the actual image packing below.
const composer = new USDComposer();
composer._createTextureFromData = function (filename, attrs, transform) {
  const texture = new THREE.Texture();
  texture.name = filename;
  this._applyTextureTransforms(texture, transform);
  return texture;
};
const assets = {};
for (const [filename, bytes] of Object.entries(archive)) {
  if (!/^0\/[^/]+\.jpg$/.test(filename)) continue;
  assets[filename] = filename;
  fs.writeFileSync(path.join(temporary, path.basename(filename)), bytes);
}
const model = composer.compose(data, assets);
model.updateMatrixWorld(true);
const meshes = [];
model.traverse(object => {
  if (!object.isMesh) return;
  meshes.push({ name: object.parent.name, geometry: object.geometry.clone().applyMatrix4(object.matrixWorld) });
});
if (meshes.length !== 6) throw new Error(`Expected six source meshes, found ${meshes.length}.`);
const expected = ['Material_0', 'Plane_364_baked_0', 'Plane_364_baked_0_1', 'Tracks_color_dds_001_0', 'Turret_0', 'Turret_0_1'];
for (let i = 0; i < meshes.length; i++) {
  if (meshes[i].name !== `Plane_364_Baked_001_${expected[i]}`) throw new Error(`Unexpected source mesh ${meshes[i].name}.`);
}

function components(geometry) {
  const positions = geometry.getAttribute('position');
  const parents = Int32Array.from({ length: positions.count / 3 }, (_, i) => i);
  const vertices = new Map();
  const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => n.toFixed(5)).join(',');
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

// The source is Y-up with the hull facing +Z, but the turret has a baked pose.
// Its real underside turntable ring centers at this point. The bore axis was
// fitted to the barrel component and checked against the circular muzzle rim.
const sourcePivot = new THREE.Vector3(.00479218, .88961, .3243675);
const sourceMuzzle = new THREE.Vector3(2.38773996, 1.09650012, 2.57588551);
const turretYaw = .7629177322979176;
const turretRotation = new THREE.Matrix4().makeRotationY(turretYaw);
const hullRotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
const sourceBounds = new THREE.Box3().setFromObject(model);
const hullBounds = new THREE.Box3();
for (const i of [1, 2, 3]) {
  meshes[i].geometry.computeBoundingBox();
  hullBounds.union(meshes[i].geometry.boundingBox);
}
const hullCenter = hullBounds.getCenter(new THREE.Vector3());
hullCenter.y = sourceBounds.min.y;
const unscaledPivot = sourcePivot.clone().sub(hullCenter).applyMatrix4(hullRotation);
const neutralPoint = (point, upper) => upper
  ? point.sub(sourcePivot).applyMatrix4(turretRotation).add(unscaledPivot)
  : point.sub(hullCenter).applyMatrix4(hullRotation);
const neutralBounds = new THREE.Box3();
for (let i = 0; i < meshes.length; i++) {
  const positions = meshes[i].geometry.attributes.position;
  for (let v = 0; v < positions.count; v++) neutralBounds.expandByPoint(neutralPoint(new THREE.Vector3().fromBufferAttribute(positions, v), i === 0 || i >= 4));
}
const scale = 78 / (neutralBounds.max.x - neutralBounds.min.x);
const pivot = unscaledPivot.clone().multiplyScalar(scale);
const muzzle = sourceMuzzle.clone().sub(sourcePivot).applyMatrix4(turretRotation).multiplyScalar(scale);
const gunComponents = components(meshes[4].geometry).filter(component => component.bounds.max.x > 1.35);
const gunFaces = new Set(gunComponents.flatMap(component => component.faces));
if (gunComponents.length !== 18 || gunFaces.size !== 2442) throw new Error('The expected barrel/sleeve/muzzle partition changed.');

const batches = new Map();
let triangles = 0;
for (let i = 0; i < meshes.length; i++) {
  const geometry = meshes[i].geometry;
  const upper = i === 0 || i >= 4;
  const material = i === 0 ? 1 : i === 3 ? 2 : i >= 4 ? 3 : 0;
  const faceBatches = new Map();
  for (let face = 0; face < geometry.attributes.position.count / 3; face++) {
    const section = i === 4 && gunFaces.has(face) ? 'recoil' : upper ? 'turret' : 'chassis';
    const key = `${section}:${material}`;
    if (!faceBatches.has(key)) faceBatches.set(key, []);
    faceBatches.get(key).push(face);
  }
  for (const [key, faces] of faceBatches) {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) throw new Error(`Missing ${name} in ${meshes[i].name}.`);
      const values = new Float32Array(faces.length * 3 * attribute.itemSize);
      let offset = 0;
      for (const face of faces) for (let v = 0; v < 3; v++) {
        const index = face * 3 + v;
        if (name === 'position') {
          const point = neutralPoint(new THREE.Vector3().fromBufferAttribute(attribute, index), upper).multiplyScalar(scale);
          if (upper) point.sub(pivot);
          values.set(point.toArray(), offset);
        } else if (name === 'normal') {
          const normal = new THREE.Vector3().fromBufferAttribute(attribute, index).transformDirection(upper ? turretRotation : hullRotation);
          values.set(normal.toArray(), offset);
        } else values.set([attribute.getX(index), 1 - attribute.getY(index)], offset);
        offset += attribute.itemSize;
      }
      part.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    triangles += faces.length;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(part);
  }
}

const gltf = {
  asset: { version: '2.0', generator: 'MTD3D Abrams USDZ preparation' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'M1A2_Woodland', children: [1], extras: { source: path.basename(source), sourceSha256: crypto.createHash('sha256').update(archiveBytes).digest('hex'), triangles, normalizedLength: 78 } },
    { name: 'heading', children: [2, 3] },
    { name: 'chassis', children: [] },
    { name: 'turret', translation: pivot.toArray(), children: [4] },
    { name: 'recoil', children: [5] },
    { name: 'muzzle', translation: muzzle.toArray() },
  ],
  meshes: [], accessors: [], bufferViews: [], buffers: [],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: [], textures: [], materials: [],
};
function texture(uri) {
  const source = gltf.images.push({ uri }) - 1;
  return gltf.textures.push({ source, sampler: 0 }) - 1;
}
for (const [name, label, metalness] of [['hull', 'Woodland hull armor', .25], ['stowage', 'Turret stowage fittings', .25], ['tracks', 'Dry rubber and steel tracks', .3]]) {
  const base = texture(`${name}-basecolor.jpg`);
  const normal = texture(`${name}-normal.png`);
  const packed = texture(`${name}-metallic-roughness.png`);
  gltf.materials.push({
    name: label,
    pbrMetallicRoughness: { baseColorTexture: { index: base }, metallicRoughnessTexture: { index: packed }, metallicFactor: metalness, roughnessFactor: 1 },
    // USD's scale=2,bias=-1 is normal decoding, already defined by glTF.
    normalTexture: { index: normal, scale: 1 },
  });
}
gltf.materials.push({ name: 'Woodland turret armor', pbrMetallicRoughness: { baseColorTexture: { index: texture('turret-basecolor.jpg') }, metallicFactor: .12, roughnessFactor: .84 } });

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
    let low = Infinity, high = -Infinity;
    for (let j = c; j < array.length; j += size) { low = Math.min(low, array[j]); high = Math.max(high, array[j]); }
    min.push(low); max.push(high);
  }
  return gltf.accessors.push({ bufferView: view, componentType: index ? array instanceof Uint16Array ? 5123 : 5125 : 5126, count: array.length / size, type, min, max }) - 1;
}
let vertices = 0;
const sectionNode = { chassis: 2, turret: 3, recoil: 4 };
for (const [key, geometries] of batches) {
  const [section, material] = key.split(':');
  const geometry = mergeVertices(mergeGeometries(geometries), .00001);
  const count = geometry.getAttribute('position').count;
  vertices += count;
  const attributes = {};
  for (const [name, semantic, type, size] of [['position', 'POSITION', 'VEC3', 3], ['normal', 'NORMAL', 'VEC3', 3], ['uv', 'TEXCOORD_0', 'VEC2', 2]]) {
    attributes[semantic] = accessor(new Float32Array(geometry.getAttribute(name).array), type, size);
  }
  const indices = accessor(count > 65535 ? new Uint32Array(geometry.index.array) : new Uint16Array(geometry.index.array), 'SCALAR', 1, true);
  const mesh = gltf.meshes.push({ name: `${section}-${gltf.materials[material].name}`, primitives: [{ attributes, indices, material: Number(material) }] }) - 1;
  gltf.nodes[sectionNode[section]].children.push(gltf.nodes.push({ name: gltf.meshes[mesh].name, mesh }) - 1);
}
gltf.buffers.push({ byteLength });
const jsonData = Buffer.from(JSON.stringify(gltf));
const json = Buffer.concat([jsonData, Buffer.alloc((4 - jsonData.length % 4) % 4, 32)]);
const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8);
jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
execFileSync(python, [path.resolve('scripts/prepare-abrams-textures.py'), temporary, output], { stdio: 'inherit' });
fs.writeFileSync(path.join(output, 'm1a2-woodland.glb'), Buffer.concat([header, jsonHeader, json, binHeader, binary]));
console.log(JSON.stringify({
  triangles, vertices, drawCalls: gltf.meshes.length, geometryBytes: byteLength,
  bounds: neutralBounds.getSize(new THREE.Vector3()).multiplyScalar(scale).toArray(),
  pivot: pivot.toArray(), muzzle: muzzle.toArray(), muzzleWorld: muzzle.clone().add(pivot).toArray(),
  sourceHullLength: hullBounds.max.z - hullBounds.min.z,
  hullLength: (hullBounds.max.z - hullBounds.min.z) * scale,
  sourceTurretYawDegrees: (Math.PI / 2 - turretYaw) * 180 / Math.PI,
  recoilTriangles: gunFaces.size,
}, null, 2));

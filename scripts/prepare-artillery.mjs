// Convert the user-supplied OBJ into a compact, rigged glTF binary.
// Usage: node scripts/prepare-artillery.mjs path/to/model.obj path/to/textures
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const [source, textures] = process.argv.slice(2);
if (!source || !textures) throw new Error('Supply the original OBJ and texture folder.');
const root = new OBJLoader().parse(fs.readFileSync(source, 'utf8'));
const output = 'public/assets/artillery'; fs.mkdirSync(output, { recursive: true });
const scale = 70 / 5.805018;
// Source is Z-up, facing -X. Game models are Y-up, facing +X.
const transform = new THREE.Matrix4().set(-scale, 0, 0, -.426 * scale, 0, 0, scale, .515593 * scale, 0, scale, 0, -.037 * scale, 0, 0, 0, 1);
const batches = new Map();
let triangles = 0;
for (const mesh of root.children) {
  if (!mesh.isMesh) continue;
  const number = Number(mesh.name.slice(-3)), geometry = mesh.geometry;
  const p = geometry.attributes.position;
  // Separate the connected barrel tube from unrelated parts in its OBJ group.
  const parents = Array.from({ length: p.count / 3 }, (_, i) => i), vertices = new Map();
  const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(x => x.toFixed(5)).join(',');
    const face = Math.floor(i / 3);
    if (vertices.has(key)) parents[find(face)] = find(vertices.get(key)); else vertices.set(key, face);
  }
  const bounds = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = find(Math.floor(i / 3));
    if (!bounds.has(key)) bounds.set(key, new THREE.Box3());
    bounds.get(key).expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i));
  }
  const faces = new Map();
  for (let face = 0; face < p.count / 3; face++) {
    const barrel = (number === 29 && bounds.get(find(face)).min.x < -2) || number === 36;
    const section = barrel ? 'recoil' : number < 20 ? 'carriage' : 'upper';
    const key = `${section}-${mesh.material.name}`;
    if (!faces.has(key)) faces.set(key, []);
    faces.get(key).push(face);
  }
  for (const [key, group] of faces) {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.attributes[name], array = [];
      for (const face of group) for (let v = 0; v < 3; v++) for (let c = 0; c < attribute.itemSize; c++) array.push(attribute.array[(face * 3 + v) * attribute.itemSize + c]);
      part.setAttribute(name, new THREE.Float32BufferAttribute(array, attribute.itemSize));
    }
    part.applyMatrix4(transform); triangles += group.length;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(part);
  }
}
const gltf = {
  asset: { version: '2.0', generator: 'MTD3D artillery preparation' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ name: 'M10_Howitzer', children: [1, 2] }, { name: 'carriage', children: [] }, { name: 'upper', children: [3] }, { name: 'recoil', children: [] }],
  meshes: [], accessors: [], bufferViews: [], buffers: [],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: Array.from({ length: 4 }, (_, i) => ({ uri: `mat${i}_c.jpg` })),
  textures: Array.from({ length: 4 }, (_, i) => ({ source: i, sampler: 0 })),
  materials: Array.from({ length: 4 }, (_, i) => ({ name: `Weathered steel ${i + 1}`, pbrMetallicRoughness: { baseColorTexture: { index: i }, metallicFactor: .25, roughnessFactor: .8 } })),
};
const chunks = []; let length = 0;
function accessor(array, type, size, index = false) {
  const raw = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const offset = length; chunks.push(raw); length += raw.length;
  const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
  const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length, target: index ? 34963 : 34962 }) - 1;
  const min = [], max = [];
  for (let c = 0; c < size; c++) { let lo = Infinity, hi = -Infinity; for (let j = c; j < array.length; j += size) { lo = Math.min(lo, array[j]); hi = Math.max(hi, array[j]); } min.push(lo); max.push(hi); }
  return gltf.accessors.push({ bufferView: view, componentType: index ? 5125 : 5126, count: array.length / size, type, min, max }) - 1;
}
for (const [key, geometries] of batches) {
  const geometry = mergeVertices(mergeGeometries(geometries), .00001);
  const attributes = {};
  for (const [name, semantic, type, size] of [['position', 'POSITION', 'VEC3', 3], ['normal', 'NORMAL', 'VEC3', 3], ['uv', 'TEXCOORD_0', 'VEC2', 2]]) attributes[semantic] = accessor(new Float32Array(geometry.attributes[name].array), type, size);
  const indices = accessor(new Uint32Array(geometry.index.array), 'SCALAR', 1, true);
  const material = Number(key.at(-1)) - 1;
  const mesh = gltf.meshes.push({ name: key, primitives: [{ attributes, indices, material }] }) - 1;
  const node = gltf.nodes.push({ name: key, mesh }) - 1;
  gltf.nodes[key.startsWith('carriage') ? 1 : key.startsWith('recoil') ? 3 : 2].children.push(node);
}
gltf.buffers.push({ byteLength: length });
let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const bin = Buffer.concat(chunks), header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(path.join(output, 'm10-howitzer.glb'), Buffer.concat([header, jsonHeader, json, binHeader, bin]));
for (let i = 0; i < 4; i++) fs.copyFileSync(path.join(textures, `mat${i}_c.jpg`), path.join(output, `mat${i}_c.jpg`));
console.log(`${triangles.toLocaleString()} triangles, ${gltf.meshes.length} batched meshes, ${length.toLocaleString()} geometry bytes`);

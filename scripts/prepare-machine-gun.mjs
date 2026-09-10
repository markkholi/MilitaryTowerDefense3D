import fs from 'node:fs';
import crypto from 'node:crypto';
// Adapt the supplied GLB without resampling textures or rebuilding its meshes.
const source = fs.readFileSync(process.argv[2]);
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2 || source.readUInt32LE(8) !== source.length) throw new Error('Expected a complete glTF 2 binary');
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
if (gltf.meshes.length !== 4 || gltf.images.length !== 3 || gltf.skins) throw new Error('Unexpected source structure');
const positions = gltf.meshes.map(mesh => gltf.accessors[mesh.primitives[0].attributes.POSITION]);
const minX = Math.min(...positions.map(p => p.min[0]));
const minZ = Math.min(...positions.map(p => p.min[2]));
const maxX = Math.max(...positions.map(p => p.max[0]));
const scale = 54 / (maxX - minX), collar = .5, ground = -minZ * scale;
const rotation = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const meshNode = (name, mesh, upper) => ({ name, mesh, rotation, scale: [scale, scale, scale], translation: [0, upper ? -collar * scale : ground, 0] });
// Authored coordinates are Z-up, +X along the bore. Neutralize the source's
// showcase yaw; live targeting controls the Y-up collar instead of a demo loop.
gltf.nodes = [
  {name:'AutoTurretMachineGun',children:[1,2],extras:{sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),normalizedLength:54}},
  {name:'chassis',children:[4,5]},
  {name:'turret',translation:[0,(collar-minZ)*scale,0],children:[6,3]},
  {name:'recoil',children:[7,8,9,10,11]},
  meshNode('stabilizer-base',0,false), meshNode('pedestal',1,false),
  meshNode('gun-mount',2,true), meshNode('gun-barrel',3,true),
  ...[[.2276245,1.519864],[-.2276245,1.519864],[.2276245,1.171359],[-.2276245,1.171359]].map(([side,height],i)=>({name:i===0?'muzzle':'muzzle-'+i,translation:[maxX*scale,(height-collar)*scale,-side*scale]})),
];
gltf.scenes = [{name:'MTD3D machine gun',nodes:[0]}]; gltf.scene = 0;
delete gltf.animations;
gltf.asset.extras.modifications = 'MTD3D: grounded and resized; neutralized showcase yaw; independent live targeting and recoil rig. Geometry and embedded texture bytes unchanged.';
const raw = Buffer.from(JSON.stringify(gltf));
const json = Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
const tail = source.subarray(20+jsonLength);
const result = Buffer.alloc(20+json.length+tail.length);
result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);tail.copy(result,20+json.length);
fs.mkdirSync('public/assets/machine-gun',{recursive:true});fs.writeFileSync('public/assets/machine-gun/auto-turret-machine-gun.glb',result);
console.log(JSON.stringify({bytes:result.length,scale,ground,triangles:gltf.meshes.reduce((n,m)=>n+gltf.accessors[m.primitives[0].indices].count/3,0),credit:gltf.asset.extras},null,2));

import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';

// Retain every source triangle and embedded image while separating rigid parts.
const source=fs.readFileSync(process.argv[2]);
if(source.readUInt32LE(0)!==0x46546c67 || source.readUInt32LE(4)!==2 || source.readUInt32LE(8)!==source.length)throw Error('Expected a complete glTF 2 binary');
const jsonLength=source.readUInt32LE(12), original=JSON.parse(source.toString('utf8',20,20+jsonLength));
if(original.meshes.length!==5 || original.images.length!==15)throw Error('Unexpected source structure');
const sourceBin=source.subarray(28+jsonLength);
function read(index){
 const a=original.accessors[index],v=original.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 const bytes={5123:2,5125:4,5126:4}[a.componentType], offset=(v.byteOffset??0)+(a.byteOffset??0);
 return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>sourceBin[a.componentType===5126?'readFloatLE':a.componentType===5123?'readUInt16LE':'readUInt32LE'](offset+i*(v.byteStride??bytes*width)+k*bytes)));
}
const batches=[];
for(let mesh=0;mesh<original.meshes.length;mesh++){
 const p=original.meshes[mesh].primitives[0], attributes=Object.fromEntries(Object.entries(p.attributes).map(([name,a])=>[name,read(a)]));
 const pos=attributes.POSITION, indices=read(p.indices).flat(), parent=pos.map((_,i)=>i);
 function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i}
 const weld=new Map();
 for(let i=0;i<pos.length;i++){const key=pos[i].map(v=>Math.round(v*1000)).join();if(weld.has(key))parent[find(i)]=find(weld.get(key));else weld.set(key,i)}
 for(let i=0;i<indices.length;i+=3){parent[find(indices[i+1])]=find(indices[i]);parent[find(indices[i+2])]=find(indices[i]);}
 const components=new Map();
 for(let i=0;i<indices.length;i+=3){const key=find(indices[i]);if(!components.has(key))components.set(key,[]);components.get(key).push(...indices.slice(i,i+3))}
 const sections=new Map();
 for(const ids of components.values()){
  const min=[0,1,2].map(k=>Math.min(...ids.map(i=>pos[i][k]))), max=[0,1,2].map(k=>Math.max(...ids.map(i=>pos[i][k])));
  // The authored upper mount sits above the chassis deck at Y=106.8.
  // Only the connected main gun (the sole part extending beyond Z=170) slides.
  const section=mesh===4 && max[2]>170?'recoil':min[1]>106?'turret':'chassis';
  if(!sections.has(section))sections.set(section,[]);sections.get(section).push(...ids);
 }
 for(const [section,ids]of sections){
  const used=[...new Set(ids)],remap=new Map(used.map((v,i)=>[v,i]));
  batches.push({section,material:p.material,attributes:Object.fromEntries(Object.entries(attributes).map(([name,values])=>[name,used.map(i=>values[i])])),indices:ids.map(i=>remap.get(i))});
 }
}
const scale=80/(180.0811004638672+162.62332153320312), ground=28.832387924194336, pivotY=107.519,pivotZ=4;
const pitch=Math.atan2(.25419434905052185,.9671532511711121);
const sourceTransform=new THREE.Matrix4().makeTranslation(-pivotZ*scale,-pivotY*scale,0).multiply(new THREE.Matrix4().makeRotationY(Math.PI/2)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale));
const recoilTransform=new THREE.Matrix4().makeRotationZ(-pitch).multiply(sourceTransform);
const muzzle=new THREE.Vector3((177.6104736328125-pivotZ)*scale,(206.78882598876953-pivotY)*scale,0).applyMatrix4(new THREE.Matrix4().makeRotationZ(-pitch));
const gltf={asset:structuredClone(original.asset),scene:0,scenes:[{nodes:[0]}],
 nodes:[{name:'ArtilleryMilitaryWeapon',children:[1,2],extras:{sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),normalizedLength:80}},
 {name:'chassis',children:[]},{name:'turret',translation:[0,(pivotY-ground)*scale,0],children:[3]},
 {name:'gun-axis',rotation:[0,0,Math.sin(pitch/2),Math.cos(pitch/2)],children:[4]},
 {name:'recoil',children:[5]},{name:'muzzle',translation:muzzle.toArray()}],
 materials:original.materials,textures:original.textures,samplers:original.samplers,images:[],meshes:[],accessors:[],bufferViews:[],buffers:[]};
gltf.asset.extras.modifications='MTD3D: grounded, resized, and oriented; rigid parts separated for independent aiming and recoil along the modeled bore. All source triangles and embedded texture bytes preserved.';
const chunks=[];let length=0;
function bufferView(data,target){const index=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,...(target?{target}:{})});chunks.push(data);length+=data.length;const pad=Buffer.alloc((4-length%4)%4);chunks.push(pad);length+=pad.length;return index}
for(const image of original.images){const v=original.bufferViews[image.bufferView];gltf.images.push({mimeType:image.mimeType,bufferView:bufferView(sourceBin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength))})}
function accessor(values,index=false){const width=index?1:values[0].length,raw=Buffer.alloc(values.length*width*4);for(let i=0;i<values.length;i++)for(let k=0;k<width;k++)raw[index?'writeUInt32LE':'writeFloatLE'](index?values[i]:values[i][k],(i*width+k)*4);const a={bufferView:bufferView(raw,index?34963:34962),componentType:index?5125:5126,count:values.length,type:{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[width]};if(!index){a.min=Array.from({length:width},(_,k)=>Math.min(...values.map(v=>v[k])));a.max=Array.from({length:width},(_,k)=>Math.max(...values.map(v=>v[k])))}gltf.accessors.push(a);return gltf.accessors.length-1}
for(const batch of batches){const name=batch.section+'-'+original.materials[batch.material].name;gltf.meshes.push({name,primitives:[{attributes:Object.fromEntries(Object.entries(batch.attributes).map(([name,values])=>[name,accessor(values)])),indices:accessor(batch.indices,true),material:batch.material}]});
 const transform=batch.section==='recoil'?recoilTransform:batch.section==='turret'?sourceTransform:new THREE.Matrix4().makeTranslation(-pivotZ*scale,-ground*scale,0).multiply(new THREE.Matrix4().makeRotationY(Math.PI/2)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale));
 const node=gltf.nodes.length;gltf.nodes.push({name,mesh:gltf.meshes.length-1,matrix:transform.toArray()});gltf.nodes[{chassis:1,turret:2,recoil:4}[batch.section]].children.push(node);
}
gltf.buffers=[{byteLength:length}];const binary=Buffer.concat(chunks),raw=Buffer.from(JSON.stringify(gltf)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
const output=Buffer.alloc(28+json.length+binary.length);output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(json.length,12);output.writeUInt32LE(0x4e4f534a,16);json.copy(output,20);output.writeUInt32LE(binary.length,20+json.length);output.writeUInt32LE(0x004e4942,24+json.length);binary.copy(output,28+json.length);
fs.mkdirSync('public/assets/artillery',{recursive:true});fs.writeFileSync('public/assets/artillery/artillery-military-weapon.glb',output);
console.log(JSON.stringify({bytes:output.length,triangles:batches.reduce((sum,b)=>sum+b.indices.length/3,0),draws:batches.length,barrelTriangles:batches.filter(b=>b.section==='recoil').reduce((sum,b)=>sum+b.indices.length/3,0),pitchDegrees:pitch*180/Math.PI,muzzle:muzzle.toArray()},null,2));

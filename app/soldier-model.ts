import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { disposeModelResources } from "./patriot-model";
import { outdoorEnvironment } from "./imported-gun-effects";
import type { UnitModel } from "./unit-models";

export const isSoldier = (kind: string) => ["infantry", "swarmling", "slinger", "brute"].includes(kind);

/** Shared source surfaces with a lightweight, independently posed walking rig. */
export class SoldierModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;
  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/soldier/scifi-soldier.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      // Preserve the supplied pose; turn its forward +Z axis toward game +X.
      const oriented = new THREE.Group(); oriented.add(scene);
      oriented.rotation.y = Math.PI / 2;
      const bounds = new THREE.Box3().setFromObject(oriented);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) {
        disposeModelResources(scene); throw new Error("Soldier asset has invalid bounds");
      }
      const scale = 28 / size.y;
      const center = bounds.getCenter(new THREE.Vector3());
      const normalized = new THREE.Group(); normalized.add(oriented);
      normalized.scale.setScalar(scale);
      oriented.position.set(-center.x, -bounds.min.y, -center.z);
      normalized.updateMatrixWorld(true);
      const prototype = new THREE.Group(), rootBone = new THREE.Bone();
      rootBone.name = "soldier-root"; prototype.add(rootBone);
      const bones = [rootBone];
      for (const side of [-1, 1]) {
        const hip = new THREE.Bone(), knee = new THREE.Bone();
        hip.name = `hip-${side}`; knee.name = `knee-${side}`;
        hip.position.set(0, 13, side * 2); knee.position.y = -6;
        rootBone.add(hip); hip.add(knee); bones.push(hip, knee);
      }
      prototype.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(bones);
      const environment = outdoorEnvironment("Soldier");
      scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
        const positions = geometry.getAttribute("position");
        const indices = new Uint16Array(positions.count * 4), weights = new Float32Array(positions.count * 4);
        const rifle = child.name === "Object_6";
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i), hip = positions.getZ(i) < 0 ? 1 : 3;
          const leg = rifle ? 0 : 1 - THREE.MathUtils.smoothstep(y, 12, 15);
          const knee = 1 - THREE.MathUtils.smoothstep(y, 6, 9);
          indices.set([0, hip, hip + 1, 0], i * 4);
          weights.set([1 - leg, leg * (1 - knee), leg * knee, 0], i * 4);
        }
        geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
        geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
        const mesh = new THREE.SkinnedMesh(geometry, child.material);
        mesh.name = child.name; mesh.castShadow = true; mesh.receiveShadow = true;
        // Three's cached skinned bounds otherwise describe only the first pose.
        mesh.frustumCulled = false;
        prototype.add(mesh); mesh.bind(skeleton);
        child.geometry.dispose();
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.envMap = environment; material.envMapIntensity = .7;
          // The source omits metallic factors (glTF defaults to fully metallic).
          // Painted armor and fabric need diffuse light to retain their colors.
          material.metalness = material.name === "AssaultRifle" ? .6 : material.name === "Armor" ? .25 : .05;
          material.roughness = material.name === "Body" ? .8 : .58;
          for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap]) {
            if (texture) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
          }
        }
      });
      this.prototype = prototype;
    } catch (error) {
      if (!this.disposed) console.warn("Soldier model unavailable; using standard infantry.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group();
    root.name = "Enemy soldier"; root.userData.soldier = true;
    const asset = clone(this.prototype);
    root.add(heading); heading.add(asset);
    const hips = [-1, 1].map(side => asset.getObjectByName(`hip-${side}`)!);
    const knees = [-1, 1].map(side => asset.getObjectByName(`knee-${side}`)!);
    return { root, heading, legs: [],
      walk(distance, moving) {
        const phase = distance * .3;
        hips.forEach((hip, i) => {
          const stride = moving ? Math.sin(phase + i * Math.PI) : 0;
          hip.rotation.z = stride * .22;
          knees[i].rotation.z = Math.max(0, -stride) * .3;
        });
        asset.position.y = moving ? Math.abs(Math.sin(phase)) * .35 : 0;
      },
      release() { disposeSkeletons(asset); },
    };
  }

  dispose() {
    this.disposed = true;
    if (this.prototype) { disposeSkeletons(this.prototype); disposeModelResources(this.prototype); }
    this.prototype = null;
  }
}

function disposeSkeletons(root: THREE.Object3D) {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(child => { if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton); });
  skeletons.forEach(skeleton => skeleton.dispose());
}

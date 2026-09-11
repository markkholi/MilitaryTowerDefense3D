import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeModelResources } from "./patriot-model";
import { outdoorEnvironment } from "./imported-gun-effects";
import type { UnitModel } from "./unit-models";

export const isFighter = (kind: string) => ["interceptor", "multirole", "strike"].includes(kind);

/** One shared F-16 asset; every sortie owns its flight transforms. */
export class FighterModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;
  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/fighter/f-16d-block-60.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      // The supplied glTF is upright and points toward -Z. Flight uses +X.
      const oriented = new THREE.Group(); oriented.add(scene);
      oriented.rotation.y = -Math.PI / 2;
      const bounds = new THREE.Box3().setFromObject(oriented);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.x) || size.x <= 0) {
        disposeModelResources(scene); throw new Error("Fighter asset has invalid bounds");
      }
      const scale = 52 / size.x;
      const center = bounds.getCenter(new THREE.Vector3());
      const prototype = new THREE.Group(); prototype.add(oriented);
      prototype.scale.setScalar(scale);
      oriented.position.copy(center).multiplyScalar(-1);
      const environment = outdoorEnvironment("Fighter");
      scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true; child.receiveShadow = true;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.envMap = environment; material.envMapIntensity = .7;
          if (material.transparent) material.depthWrite = false;
          for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap]) {
            if (texture) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
          }
        }
      });
      this.prototype = prototype;
    } catch (error) {
      if (!this.disposed) console.warn("Fighter model unavailable; using the standard aircraft.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group();
    root.name = "F-16D Block 60"; root.userData.fighter = true;
    root.add(heading); heading.add(this.prototype.clone(true));
    return { root, heading, legs: [] };
  }

  dispose() {
    this.disposed = true;
    if (this.prototype) disposeModelResources(this.prototype);
    this.prototype = null;
  }
}

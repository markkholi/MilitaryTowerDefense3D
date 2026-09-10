import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeModelResources } from "./patriot-model";
import { muzzleFlash, outdoorEnvironment } from "./imported-gun-effects";
import type { UnitModel } from "./unit-models";

/** Shared textured asset with independent turret and recoiling gun transforms. */
export class ArtilleryModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;

  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/artillery/artillery-military-weapon.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      const muzzle = scene.getObjectByName("muzzle");
      if (!scene.getObjectByName("turret") || !scene.getObjectByName("recoil") || !muzzle) {
        disposeModelResources(scene);
        throw new Error("Artillery asset is missing its turret or gun rig");
      }
      const environment = outdoorEnvironment("Artillery");
      scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true; child.receiveShadow = true;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.envMap = environment;
          material.envMapIntensity = .85;
          for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap]) {
            if (texture) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
          }
        }
      });
      muzzle.add(muzzleFlash());
      this.prototype = scene;
    } catch (error) {
      if (!this.disposed) console.warn("Artillery model unavailable; using the standard artillery model.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group(), asset = this.prototype.clone(true);
    root.name = "Artillery turret"; root.userData.artillery = true;
    root.add(heading); heading.add(asset);
    const barrel = asset.getObjectByName("recoil");
    return {
      root, heading, legs: [], turret: asset.getObjectByName("turret"), barrel,
      barrelRestX: barrel?.position.x ?? 0,
      muzzle: asset.getObjectByName("muzzle"),
      flash: asset.getObjectByName("muzzle-flash") as THREE.Mesh,
    };
  }

  dispose() {
    this.disposed = true;
    if (this.prototype) disposeModelResources(this.prototype);
    this.prototype = null;
  }
}

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeModelResources } from "./patriot-model";
import { muzzleFlash, outdoorEnvironment } from "./imported-gun-effects";
import type { UnitModel } from "./unit-models";

/** Shared textured asset with independent turret and recoiling gun transforms. */
export class MachineGunModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;

  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/machine-gun/auto-turret-machine-gun.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      const muzzles = ["muzzle", "muzzle-1", "muzzle-2", "muzzle-3"].map(name => scene.getObjectByName(name));
      if (!scene.getObjectByName("turret") || !scene.getObjectByName("recoil") || muzzles.some(muzzle => !muzzle)) {
        disposeModelResources(scene);
        throw new Error("Machine-gun asset is missing its turret or gun rig");
      }
      const environment = outdoorEnvironment("Machine-gun");
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
      const flash = muzzleFlash(); flash.scale.setScalar(.5); flash.position.x *= .5;
      muzzles.forEach((muzzle, index) => muzzle!.add(index === 0 ? flash : flash.clone(true)));
      this.prototype = scene;
    } catch (error) {
      if (!this.disposed) console.warn("Machine-gun model unavailable; using the standard machine-gun model.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group(), asset = this.prototype.clone(true);
    root.name = "Machine-gun turret"; root.userData.machineGun = true;
    root.add(heading); heading.add(asset);
    const barrel = asset.getObjectByName("recoil");
    const muzzles = ["muzzle", "muzzle-1", "muzzle-2", "muzzle-3"].map(name => asset.getObjectByName(name)!);
    const flashes = muzzles.map(muzzle => muzzle.getObjectByName("muzzle-flash") as THREE.Mesh);
    return {
      root, heading, legs: [], turret: asset.getObjectByName("turret"), barrel,
      barrelRestX: barrel?.position.x ?? 0, recoilDistance: .8,
      muzzle: muzzles[0], flash: flashes[0], muzzles, flashes,
    };
  }

  dispose() {
    this.disposed = true;
    if (this.prototype) disposeModelResources(this.prototype);
    this.prototype = null;
  }
}

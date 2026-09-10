import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { UnitModel } from "./unit-models";

/** One shared GPU asset; each emplacement owns its own aiming transforms. */
export class PatriotModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;

  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/patriot/mim-104-patriot.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          for (const texture of [material.map, material.roughnessMap, material.normalMap]) {
            if (texture) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
          }
        }
      });
      if (!scene.getObjectByName("launcher") || !scene.getObjectByName("launch-origin")) {
        disposeModelResources(scene);
        throw new Error("Patriot asset is missing its launcher rig");
      }
      this.prototype = scene;
    } catch (error) {
      if (!this.disposed) console.warn("Patriot model unavailable; using the standard air-defense model.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group();
    const asset = this.prototype.clone(true);
    root.name = "Patriot air defense";
    root.userData.patriot = true;
    root.add(heading); heading.add(asset);
    return {
      root, heading, legs: [],
      turret: asset.getObjectByName("launcher"),
      launchOrigin: asset.getObjectByName("launch-origin"),
    };
  }

  dispose() {
    this.disposed = true;
    if (this.prototype) disposeModelResources(this.prototype);
    this.prototype = null;
  }
}

/** Clones share geometry, materials and textures. Release each resource once. */
export function disposeModelResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<{ close: () => void }>();
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
        textures.add(value);
        // GLTFLoader decodes owned ImageBitmaps outside the WebGL allocation.
        if (value.source.data && typeof value.source.data.close === "function") images.add(value.source.data);
      }
    }
  });
  geometries.forEach(resource => resource.dispose());
  materials.forEach(resource => resource.dispose());
  textures.forEach(resource => resource.dispose());
  images.forEach(resource => resource.close());
}

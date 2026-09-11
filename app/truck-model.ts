import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeModelResources } from "./patriot-model";
import { outdoorEnvironment } from "./imported-gun-effects";
import type { UnitModel } from "./unit-models";



/** Shared textured Gurkha with independently rolling wheels for each scout. */
export class TruckModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;
  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/truck/gurkha.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      // The supplied glTF is upright and points toward -Z; road travel uses +X.
      const oriented = new THREE.Group(); oriented.add(scene);
      oriented.rotation.y = -Math.PI / 2;
      const bounds = new THREE.Box3().setFromObject(oriented);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.x) || size.x <= 0) {
        disposeModelResources(scene); throw new Error("Truck asset has invalid bounds");
      }
      const scale = 44 / size.x;
      const center = bounds.getCenter(new THREE.Vector3());
      const prototype = new THREE.Group(), normalized = new THREE.Group();
      prototype.add(normalized); normalized.add(oriented);
      normalized.scale.setScalar(scale);
      oriented.position.set(-center.x, -bounds.min.y, -center.z);
      const environment = outdoorEnvironment("Truck");
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
      prototype.updateMatrixWorld(true);
      const tires: THREE.Object3D[] = [];
      prototype.traverse(child => { if (/^Tire_Base_Model(?:00[123])?$/.test(child.name)) tires.push(child); });
      tires.forEach((tire, i) => {
        const wheelBounds = new THREE.Box3().setFromObject(tire), pivot = new THREE.Group();
        pivot.name = `truck-wheel-${i}`;
        wheelBounds.getCenter(pivot.position);
        pivot.userData.radius = wheelBounds.getSize(new THREE.Vector3()).y / 2;
        prototype.add(pivot); pivot.attach(tire);
      });
      this.prototype = prototype;
    } catch (error) {
      if (!this.disposed) console.warn("Truck model unavailable; using the standard scout.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group();
    root.name = "Terradyne Gurkha"; root.userData.truck = true;
    const asset = this.prototype.clone(true);
    root.add(heading); heading.add(asset);
    const wheels: THREE.Object3D[] = [];
    asset.traverse(child => { if (child.name.startsWith("truck-wheel-")) wheels.push(child); });
    return { root, heading, legs: [], roll(distance) {
      wheels.forEach(wheel => { wheel.rotation.z = -distance / wheel.userData.radius; });
    } };
  }

  dispose() {
    this.disposed = true;
    if (this.prototype) disposeModelResources(this.prototype);
    this.prototype = null;
  }
}

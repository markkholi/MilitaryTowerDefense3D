import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeModelResources } from "./patriot-model";
import type { UnitModel } from "./unit-models";

/** Shared textured asset with independent hull, turret and gun transforms. */
export class AbramsModels {
  private prototype: THREE.Group | null = null;
  private disposed = false;

  get ready() { return this.prototype !== null; }

  async load(anisotropy: number, loader = new GLTFLoader()) {
    try {
      const { scene } = await loader.loadAsync("./assets/abrams/m1a2-woodland.glb");
      if (this.disposed) { disposeModelResources(scene); return; }
      const muzzle = scene.getObjectByName("muzzle");
      if (!scene.getObjectByName("turret") || !scene.getObjectByName("recoil") || !muzzle) {
        disposeModelResources(scene);
        throw new Error("Abrams asset is missing its turret or gun rig");
      }
      const environment = outdoorEnvironment();
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
      if (!this.disposed) console.warn("Abrams model unavailable; using the standard tank model.", error);
    }
  }

  create(): UnitModel | null {
    if (!this.prototype || this.disposed) return null;
    const root = new THREE.Group(), heading = new THREE.Group(), asset = this.prototype.clone(true);
    root.name = "M1A2 woodland tank"; root.userData.abrams = true;
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

function muzzleFlash() {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1) * 2 - 1;
    const width = .12 + Math.sin(u * Math.PI) * .35;
    const alpha = Math.exp(-2 * (v / width) ** 2) * Math.sin(u * Math.PI) ** .3;
    const heat = Math.exp(-6 * (u - .25) ** 2 - 4 * v * v);
    const i = (y * size + x) * 4;
    pixels[i] = 255; pixels[i + 1] = 170 + Math.round(85 * heat);
    pixels[i + 2] = 45 + Math.round(210 * heat); pixels[i + 3] = Math.round(alpha * 210);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(12, 6);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const flash = new THREE.Mesh(geometry, material);
  flash.name = "muzzle-flash"; flash.position.x = 6; flash.visible = false;
  // Crossed soft plumes remain visible from side, overhead and end-on cameras.
  for (const angle of [Math.PI / 3, -Math.PI / 3]) {
    const plane = new THREE.Mesh(geometry, material); plane.name = "muzzle-flash";
    plane.rotation.x = angle; flash.add(plane);
  }
  const core = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material);
  core.name = "muzzle-flash"; core.rotation.y = Math.PI / 2; core.position.x = -4; flash.add(core);
  return flash;
}

/** Soft sky/ground illumination keeps dark camouflage and worn metal readable.
 * The renderer filters this shared reflection texture; no remote HDR is needed. */
function outdoorEnvironment() {
  const width = 128, height = 64, pixels = new Uint8Array(width * height * 4);
  const sky = new THREE.Color("#b6cdea"), horizon = new THREE.Color("#edf0e3"), ground = new THREE.Color("#6b6951");
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) {
    // DataTexture has no image flip: Three samples the zenith at V=1.
    const elevation = -Math.cos(y / (height - 1) * Math.PI);
    color.copy(horizon).lerp(elevation > 0 ? sky : ground, Math.pow(Math.abs(elevation), .45));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = Math.round(color.r * 255); pixels[i + 1] = Math.round(color.g * 255);
      pixels[i + 2] = Math.round(color.b * 255); pixels[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = "Abrams soft outdoor environment";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

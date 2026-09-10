import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type UnitModel = {
  root: THREE.Group;
  heading: THREE.Group;
  turret?: THREE.Object3D;
  barrel?: THREE.Group;
  legs: THREE.Group[];
  rotor?: THREE.Group;
  flash?: THREE.Mesh;
  launchOrigin?: THREE.Object3D;
};

/** Shared geometry/materials keep large waves inexpensive. All dimensions use
 * the original simulation's world units. Models face local +X. */
export class UnitWorkshop {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private prototypes = new Map<string, UnitModel>();
  private merged = new Set<THREE.BufferGeometry>();

  material(color: string, metal = false) {
    const key = `${color}-${metal}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: metal ? .55 : .9, metalness: metal ? .45 : .04, flatShading: true,
    }));
    return this.materials.get(key)!;
  }

  box(parent: THREE.Object3D, size: number[], pos: number[], color: string, metal = false) {
    if (!this.geometries.has("box")) this.geometries.set("box", new THREE.BoxGeometry(1, 1, 1));
    const mesh = new THREE.Mesh(this.geometries.get("box"), this.material(color, metal));
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  cylinder(parent: THREE.Object3D, r: number, height: number, pos: number[], color: string, segments = 10, top = r) {
    const key = `cylinder-${segments}-${top / r}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.CylinderGeometry(top / r, 1, 1, segments));
    const mesh = new THREE.Mesh(this.geometries.get(key), this.material(color, true));
    mesh.scale.set(r, height, r); mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }

  private group(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group); return group;
  }

  private soldier(parent: THREE.Object3D, color: string, x = 0, z = 0, heavy = false) {
    const man = this.group(parent, x, 0, z);
    const legs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = this.group(man, 0, 9, side * 2.5);
      this.box(leg, [3.6, 8, 3.4], [0, -3.5, 0], color);
      this.box(leg, [5.2, 2.5, 3.8], [1, -7, 0], "#242822");
      legs.push(leg);
      const arm = this.box(man, [4, 8, 3.3], [3, 13, side * 5.2], color);
      arm.rotation.z = -.5;
      this.box(man, [3, 2.6, 3], [5, 10.6, side * 5], "#bc9571");
    }
    this.box(man, [7, 10, 9], [0, 13, 0], color);
    this.box(man, [3, 7, 9.5], [3.9, 13.5, 0], "#444d38");
    this.box(man, [3.5, 7, 7], [-4.5, 14, 0], "#444b31");
    this.box(man, [1.5, 3, 2.5], [5.7, 13, 2.8], "#939272");
    this.cylinder(man, 3.4, 5, [0, 21, 0], "#b99577", 8);
    this.cylinder(man, heavy ? 5 : 4.6, 4, [0, 24, 0], color, 10, 3.2);
    this.box(man, [3.5, 1.6, 5], [3, 22, 0], "#283632");
    this.box(man, [heavy ? 20 : 17, heavy ? 4 : 2, 2.5], [9, heavy ? 17 : 12, -3.3], "#30342f", true);
    this.box(man, [2, 4, 2], [7, 10, -3.3], "#353d32");
    return legs;
  }

  private sandbags(parent: THREE.Object3D, radius: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      for (let layer = 0; layer < 2; layer++) {
        const a = angle + layer * .07;
        const bag = this.box(parent, [10, 4, 6], [Math.cos(a) * radius, 3 + layer * 4, Math.sin(a) * radius], color);
        bag.rotation.y = -a + Math.PI / 2;
      }
    }
  }

  private wheels(parent: THREE.Object3D, length: number, width: number, count: number, tracked: boolean) {
    for (const side of [-1, 1]) {
      if (tracked) {
        this.box(parent, [length + 6, 12, 8], [0, 7, side * width / 2], "#292c29", true);
        for (let i = 0; i < 12; i++) {
          this.box(parent, [2, 1.5, 8.5], [-length / 2 + i * length / 11, 13.5, side * width / 2], "#616459", true);
        }
      }
      for (let i = 0; i < count; i++) {
        const x = -length / 2 + 5 + i * (length - 10) / Math.max(1, count - 1);
        const wheel = this.cylinder(parent, tracked ? 5.4 : 7, 4, [x, 7, side * (width / 2 + 2)], "#252b29", 12);
        wheel.rotation.x = Math.PI / 2;
        const hub = this.cylinder(parent, 2.8, 4.5, [x, 7, side * (width / 2 + 2.5)], "#7b806b", 10);
        hub.rotation.x = Math.PI / 2;
      }
    }
  }

  create(kind: string, enemy = false, rank = 0): UnitModel {
    const key = `${kind}-${enemy}-${Math.min(rank, 4)}`;
    let prototype = this.prototypes.get(key);
    if (!prototype) {
      prototype = this.build(kind, enemy, rank);
      const flash = prototype.flash;
      prototype.root.traverse(object => {
        if (!(object instanceof THREE.Group)) return;
        const batches = new Map<THREE.Material, THREE.Mesh[]>();
        for (const child of object.children) {
          if (!(child instanceof THREE.Mesh) || child === flash || Array.isArray(child.material)) continue;
          const batch = batches.get(child.material) ?? []; batch.push(child); batches.set(child.material, batch);
        }
        batches.forEach((meshes, material) => {
          if (meshes.length < 2) return;
          const geometries = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
          const geometry = mergeGeometries(geometries);
          geometries.forEach(g => g.dispose());
          if (!geometry) return;
          this.merged.add(geometry);
          const combined = new THREE.Mesh(geometry, material); combined.castShadow = true; combined.receiveShadow = true;
          meshes.forEach(mesh => object.remove(mesh)); object.add(combined);
        });
      });
      this.prototypes.set(key, prototype);
    }
    const root = prototype.root.clone(true), originals: THREE.Object3D[] = [], copies: THREE.Object3D[] = [];
    prototype.root.traverse(o => originals.push(o)); root.traverse(o => copies.push(o));
    const group = (o: THREE.Group) => copies[originals.indexOf(o)] as THREE.Group;
    return {
      root, heading: group(prototype.heading), legs: prototype.legs.map(group),
      turret: prototype.turret ? copies[originals.indexOf(prototype.turret)] : undefined,
      barrel: prototype.barrel ? group(prototype.barrel) : undefined,
      rotor: prototype.rotor ? group(prototype.rotor) : undefined,
      flash: prototype.flash ? copies[originals.indexOf(prototype.flash)] as THREE.Mesh : undefined,
    };
  }

  private build(kind: string, enemy: boolean, rank: number): UnitModel {
    const root = new THREE.Group();
    const heading = this.group(root);
    const unit: UnitModel = { root, heading, legs: [] };
    const olive = enemy ? "#9b7653" : "#758165";
    const light = enemy ? "#bc976f" : "#a1ac84";
    const dark = enemy ? "#574a37" : "#465543";

    if (["infantry", "swarmling", "slinger", "brute"].includes(kind)) {
      unit.legs = this.soldier(heading, olive, 0, 0, kind === "slinger" || kind === "brute");
      if (kind === "brute") heading.scale.setScalar(1.25);
      if (kind === "swarmling") heading.scale.setScalar(.8);
    } else if (["interceptor", "multirole", "strike", "gunship", "bomber"].includes(kind)) {
      const gunship = kind === "gunship";
      const fuselage = this.cylinder(heading, gunship ? 5.3 : 3.5, 46, [0, 4, 0], light, 10, 1.4);
      fuselage.rotation.z = -Math.PI / 2;
      this.box(heading, [11, 3, 5], [9, 7, 0], "#36566a", true);
      const wing = this.box(heading, [12, 1.4, gunship ? 46 : 34], [-3, 4, 0], olive, true);
      wing.rotation.y = gunship ? 0 : -.15;
      this.box(heading, [8, 1.2, 17], [-18, 5, 0], olive, true);
      this.box(heading, [9, 9, 1.2], [-18, 9, 0], dark, true).rotation.z = -.3;
      for (const side of [-1, 1]) {
        const rocket = this.cylinder(heading, 1.7, 10, [-1, 2, side * 12], "#d5d4c3", 8, .5);
        rocket.rotation.z = -Math.PI / 2;
        this.box(heading, [3, 1, 2], [-4, 2, side * 12], "#dbb562");
      }
      if (gunship) {
        unit.rotor = this.group(heading, 9, 4, 0);
        for (const side of [-1, 1]) {
          const propeller = this.group(unit.rotor, 0, 0, side * 13);
          this.box(propeller, [1, 20, 1.4], [0, 0, 0], "#303b34");
          this.box(propeller, [1, 1.4, 20], [0, 0, 0], "#303b34");
        }
      }
      if (kind === "bomber") heading.scale.setScalar(.82);
    } else if (kind === "hq" || kind === "airbase") {
      const airbase = kind === "airbase";
      this.box(heading, [airbase ? 100 : 76, 3, airbase ? 72 : 65], [0, 1.5, 0], "#696d5e");
      if (airbase) {
        this.box(heading, [96, .8, 22], [0, 3.5, 20], "#373f3d");
        for (let x = -38; x < 45; x += 15) this.box(heading, [8, 1, 1.5], [x, 4, 20], "#e0d6a7");
        this.box(heading, [43, 19, 26], [-14, 13, -16], olive);
        this.box(heading, [45, 4, 28], [-14, 24, -16], dark);
        this.box(heading, [1, 14, 20], [8, 12, -16], "#293832");
        const parked = this.create("interceptor"); parked.root.scale.setScalar(.57); parked.root.position.set(17, 6, 20); heading.add(parked.root);
      } else {
        this.sandbags(heading, 37, 20, "#a39976");
        this.box(heading, [44, 24, 34], [-2, 14, 0], olive);
        this.box(heading, [48, 5, 38], [-2, 28, 0], dark);
        this.box(heading, [1, 13, 9], [20.5, 9, 0], "#253a34");
        for (const side of [-1, 1]) this.box(heading, [13, 6, 1], [-3, 18, side * 17.6], "#739dab", true);
        this.box(heading, [9, 6, 12], [2, 33, 0], light);
        if (rank > 0) {
          const defense = this.create(rank > 1 ? "air" : "mg");
          defense.root.scale.setScalar(.42); defense.root.position.set(22, 4, 24); heading.add(defense.root);
        }
      }
      this.cylinder(heading, .9, 57, [-26, 29, -23], "#a5af9d", 6);
      this.box(heading, [15, 9, .7], [-18, 53, -23], "#c8b56c");
      this.box(heading, [2, 6, .9], [-19, 53, -23], "#30483c");
      const dish = this.cylinder(heading, 9, 2, [21, 32, -22], "#a8b4a0", 16);
      dish.rotation.z = .6; unit.rotor = this.group(heading, 21, 32, -22);
      this.box(unit.rotor, [22, 1, 2], [0, 4, 0], "#d2d7bc");
    } else if (kind === "mg" || kind === "at" || kind === "artillery") {
      if (kind === "mg") {
        this.sandbags(heading, 22, 15, "#a99e78");
        unit.legs = this.soldier(heading, dark, -9, 0);
        const loader = this.group(heading, -7, 0, 12); loader.scale.setScalar(.85);
        this.soldier(loader, olive);
        this.box(heading, [10, 6, 9], [-5, 3, -15], "#4f6242");
      } else if (kind === "artillery") {
        this.wheels(heading, 16, 28, 2, false);
        for (const side of [-1, 1]) {
          this.box(heading, [32, 3, 3], [-18, 4, side * 10], dark).rotation.y = side * .3;
        }
        this.box(heading, [8, 16, 25], [1, 14, 0], olive).rotation.z = .15;
        const crew = this.group(heading, -10, 0, 23); crew.scale.setScalar(.75); this.soldier(crew, olive);
      } else {
        for (const side of [-1, 1]) this.box(heading, [23, 2.5, 3], [0, 5, side * 6], dark).rotation.y = side * .5;
        this.soldier(heading, dark, -10, 12);
        this.box(heading, [17, 7, 8], [-5, 3, -17], "#5f704f");
      }
      this.cylinder(heading, 3.2, 15, [0, 9, 0], dark);
      unit.turret = this.group(heading, 0, kind === "artillery" ? 19 : 17, 0);
      unit.barrel = this.group(unit.turret);
      const length = kind === "artillery" ? 40 : kind === "at" ? 24 : 22;
      const radius = kind === "at" ? 4.5 : kind === "artillery" ? 3 : 1.5;
      const barrel = this.cylinder(unit.barrel, radius, length, [length / 2 - 3, 0, 0], kind === "at" ? olive : "#4a554a", 10);
      barrel.rotation.z = -Math.PI / 2;
      const muzzle = this.cylinder(unit.barrel, radius * 1.12, 3, [length - 3, 0, 0], "#252f2a", 10);
      muzzle.rotation.z = -Math.PI / 2;
      if (kind === "artillery") unit.barrel.rotation.z = .23;
      this.box(unit.turret, [8, 5, 8], [-3, 0, 0], olive);
      if (rank > 1) this.box(unit.turret, [5, 4, 4], [0, 4, -5], "#3c6970", true);
    } else {
      const small = kind === "scout";
      const wheeled = small || kind === "air";
      const length = small ? 28 : kind === "siege" ? 57 : 47;
      const width = small ? 20 : 33;
      this.wheels(heading, length, width, wheeled ? 2 : 5, !wheeled);
      this.box(heading, [length, 11, width], [0, 13, 0], olive);
      this.box(heading, [length - 4, 4, width - 2], [0, 20, 0], light);
      this.box(heading, [8, 5, width - 3], [length / 2 - 3, 17, 0], light).rotation.z = -.4;
      for (let i = 0; i < 5; i++) this.box(heading, [2, 1, width * .55], [-length / 2 + 4 + i * 2.6, 22.5, 0], dark);
      for (const side of [-1, 1]) {
        this.box(heading, [3, 3, 4], [length / 2 + .2, 16, side * width * .32], "#e6dfaf", true);
        this.box(heading, [13, 4, 4], [-length / 2 + 6, 23, side * width * .35], dark);
      }
      unit.turret = this.group(heading, 3, 23, 0);
      if (kind === "air") {
        this.box(unit.turret, [17, 10, 18], [0, 1, 0], dark);
        this.box(unit.turret, [12, 4, 16], [2, 9, 0], light);
        for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
          const tube = this.cylinder(unit.turret, 3.2, 22, [4, 7 + i * 6, side * 13], olive, 8);
          tube.rotation.z = -Math.PI / 2 + .2;
        }
        unit.rotor = this.group(unit.turret, -3, 17, 0);
        this.box(unit.rotor, [3, 9, 13], [0, 0, 0], "#b3bd9f", true);
      } else {
        this.cylinder(unit.turret, small ? 7 : 14, 8, [0, 0, 0], olive, 8, small ? 6 : 11);
        this.box(unit.turret, [small ? 12 : 22, 7, small ? 12 : 23], [2, 1, 0], light);
        this.cylinder(unit.turret, 4.5, 2, [-4, 6, 0], dark, 12);
        unit.barrel = this.group(unit.turret, 8, 1, 0);
        const barrelLength = small ? 17 : kind === "bulwark" ? 25 : 35;
        const barrel = this.cylinder(unit.barrel, small ? 1.2 : 2.3, barrelLength, [barrelLength / 2, 0, 0], dark, 10);
        barrel.rotation.z = -Math.PI / 2;
        this.box(unit.barrel, [5, 5, 5], [barrelLength - 1, 0, 0], "#343f35", true);
        this.box(unit.turret, [9, 2, 2], [0, 8, -7], "#242f2a", true);
        if (rank > 0) for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
          this.box(unit.turret, [5, 5, 3], [-5 + i * 6, 2, side * 13], dark);
        }
        if (rank > 2) this.box(unit.turret, [8, 5, 6], [5, 8, 5], "#415f59", true);
      }
      this.cylinder(unit.turret, .45, 25, [-8, 16, -8], "#242f28", 5);
      if (kind === "siege") heading.scale.setScalar(1.12);
    }
    if (unit.barrel) {
      const flash = this.cylinder(unit.barrel, 4, 8, [kind === "artillery" ? 40 : kind === "at" ? 25 : kind === "mg" ? 22 : 38, 0, 0], "#ffcb63", 7, .3);
      flash.rotation.z = -Math.PI / 2; flash.visible = false;
      unit.flash = flash;
    }
    return unit;
  }

  dispose() {
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
    this.merged.forEach(g => g.dispose()); this.merged.clear(); this.prototypes.clear();
    this.geometries.clear(); this.materials.clear();
  }
}

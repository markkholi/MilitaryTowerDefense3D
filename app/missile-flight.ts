import * as THREE from "three";

export const MISSILE_DURATION = .42;
export const MISSILE_IMPACT_TIME = MISSILE_DURATION * .78;

/** Visual flight only: the simulation still owns hits, damage and reload time. */
export class MissileFlight extends THREE.Group {
  private curve: THREE.CubicBezierCurve3;
  private rocket = new THREE.Group();
  private smoke: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>[] = [];
  private exhaust: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, target: THREE.Vector3) {
    super();
    const climb = origin.clone().addScaledVector(direction, Math.min(45, origin.distanceTo(target) * .4));
    const approach = origin.clone().lerp(target, .65); approach.y = Math.max(origin.y, target.y) + 25;
    this.curve = new THREE.CubicBezierCurve3(origin.clone(), climb, approach, target.clone());
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, 6, 8), new THREE.MeshStandardMaterial({ color: "#d9d8c5", roughness: .58, metalness: .2 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.65, 2, 8), new THREE.MeshStandardMaterial({ color: "#b7b9ac", roughness: .7 }));
    nose.position.y = 4;
    this.exhaust = new THREE.Mesh(new THREE.ConeGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({ color: "#ffe3a3", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.exhaust.position.y = -8;
    this.exhaust.rotation.z = Math.PI;
    this.rocket.add(body, nose, this.exhaust); this.add(this.rocket);
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 16; i++) {
      const puff = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: "#bdc3b8", transparent: true, opacity: 0, depthWrite: false }));
      this.smoke.push(puff); this.add(puff);
    }
    this.update(0);
  }

  update(progress: number) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const flight = Math.min(1, t / .78);
    this.rocket.position.copy(this.curve.getPoint(flight));
    this.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.curve.getTangent(flight));
    this.rocket.visible = t < .78;
    this.exhaust.scale.set(1, .8 + .2 * Math.sin(t * 85), 1);
    this.smoke.forEach((puff, i) => {
      const at = i / this.smoke.length;
      const age = flight - at;
      puff.visible = age >= 0;
      if (!puff.visible) return;
      puff.position.copy(this.curve.getPoint(at));
      puff.position.y += age * 4;
      puff.scale.setScalar(1 + age * 5);
      puff.material.opacity = Math.max(0, .28 * (1 - age) * (1 - t));
    });
  }
}

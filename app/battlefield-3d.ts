import * as THREE from "three";
import { ENEMIES, FAMILIES, FRONTS, HQ_DEFENSE_LEVELS, type Point } from "./game-data";
import type { GameState, Position } from "./game-client";
import { UnitWorkshop, type UnitModel } from "./unit-models";
import { PatriotModels } from "./patriot-model";
import { MissileFlight } from "./missile-flight";
import { AbramsModels } from "./abrams-model";
import { AntiTankModels } from "./anti-tank-model";
import { MachineGunModels } from "./machine-gun-model";
import { ArtilleryModels } from "./artillery-model";

type DrawEntry = { model: UnitModel; kind: string; rank: number; firedAt: number; lastShotId?: number; muzzleIndex?: number };
type RangeStats = { range: number; minRange: number };

export class Battlefield3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-560, 560, 364, -364, 1, 4000);
  private workshop = new UnitWorkshop();
  private entities = new Map<string, DrawEntry>();
  private effectObjects = new Map<number, THREE.Group>();
  private texture: THREE.CanvasTexture;
  private terrainCanvas = document.createElement("canvas");
  private overlay: CanvasRenderingContext2D;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private observer: ResizeObserver;
  private yaw = 0;
  private elevation = .9;
  private zoom = 1;
  private focus = new THREE.Vector3();
  private width = 1000;
  private height = 650;
  private terrainReady = false;
  private effectGeometry = new THREE.IcosahedronGeometry(1, 1);
  private artilleryModels = new ArtilleryModels();
  private patriots = new PatriotModels();
  private abrams = new AbramsModels();
  private antiTanks = new AntiTankModels();
  private machineGuns = new MachineGunModels();

  constructor(
    private canvas: HTMLCanvasElement,
    private overlayCanvas: HTMLCanvasElement,
    private frontIndex: number,
    private hq: Point,
    private paintTerrain: (ctx: CanvasRenderingContext2D) => boolean,
    private stats: (p: Position) => RangeStats,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.scene.background = new THREE.Color("#172421");
    this.scene.add(new THREE.HemisphereLight("#e6f1ff", "#636248", 2.1));
    const sun = new THREE.DirectionalLight("#ffe3ae", 3.3);
    sun.position.set(-360, 720, -240); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 760, bottom: -760, near: 1, far: 1800 });
    sun.shadow.normalBias = 1.5; sun.shadow.bias = -.0001;
    this.scene.add(sun);
    this.terrainCanvas.width = 1000; this.terrainCanvas.height = 650;
    this.texture = new THREE.CanvasTexture(this.terrainCanvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(1000, 650), new THREE.MeshStandardMaterial({
      map: this.texture, roughness: 1, metalness: 0,
    }));
    terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true; this.scene.add(terrain);
    this.workshop.box(this.scene, [1002, 23, 652], [0, -13, 0], "#414738");
    this.workshop.box(this.scene, [1050, 6, 700], [0, -28, 0], "#222e28");
    this.addScenery();
    void this.artilleryModels.load(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    void this.patriots.load(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    void this.abrams.load(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    void this.antiTanks.load(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    void this.machineGuns.load(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    const ctx = overlayCanvas.getContext("2d");
    if (!ctx) throw new Error("The tactical overlay could not start.");
    this.overlay = ctx;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas); this.resize();
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.renderer.setSize(this.width, this.height, false);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlayCanvas.width = Math.round(this.width * dpr);
    this.overlayCanvas.height = Math.round(this.height * dpr);
    this.overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.updateCamera();
  }

  private updateCamera() {
    const aspect = this.width / this.height;
    // Fit every corner even when the view rotates. Zoom then deliberately crops.
    const projectedWidth = Math.abs(Math.cos(this.yaw)) * 1000 + Math.abs(Math.sin(this.yaw)) * 650;
    const projectedDepth = (Math.abs(Math.sin(this.yaw)) * 1000 + Math.abs(Math.cos(this.yaw)) * 650) * Math.sin(this.elevation);
    const halfHeight = Math.max((projectedDepth + 150) / 2, (projectedWidth + 100) / (2 * aspect));
    Object.assign(this.camera, { left: -halfHeight * aspect, right: halfHeight * aspect, top: halfHeight, bottom: -halfHeight, zoom: this.zoom });
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.elevation) * 1250, Math.sin(this.elevation) * 1250, Math.cos(this.yaw) * Math.cos(this.elevation) * 1250).add(this.focus);
    this.camera.lookAt(this.focus); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }

  control(action: "left" | "right" | "in" | "out" | "tilt" | "reset") {
    if (action === "left") this.yaw -= Math.PI / 8;
    if (action === "right") this.yaw += Math.PI / 8;
    if (action === "in") this.zoom = Math.min(2.5, this.zoom + .2);
    if (action === "out") this.zoom = Math.max(.8, this.zoom - .2);
    if (action === "tilt") this.elevation = this.elevation > 1.1 ? .9 : 1.45;
    if (action === "reset") { this.yaw = 0; this.zoom = 1; this.elevation = .9; this.focus.set(0, 0, 0); }
    this.updateCamera();
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const underCursor = this.pointAt(event.clientX, event.clientY, false);
    const previous = this.zoom;
    this.zoom = Math.max(.8, Math.min(2.5, this.zoom * Math.exp(-event.deltaY * .001)));
    if (underCursor && this.zoom > previous) {
      this.focus.lerp(new THREE.Vector3(underCursor.x - 500, 0, underCursor.y - 325), .15);
    }
    if (this.zoom <= 1) this.focus.set(0, 0, 0);
    this.updateCamera();
  };

  pointAt(clientX: number, clientY: number, pickUnits = true): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    if (pickUnits) {
      const hit = this.raycaster.intersectObjects([...this.entities.entries()].filter(([key]) => key.startsWith("p") || key === "hq").map(([, e]) => e.model.root), true)[0];
      if (hit) {
        let object: THREE.Object3D | null = hit.object;
        while (object) {
          if (object.userData.point) return object.userData.point as Point;
          object = object.parent;
        }
      }
    }
    const point = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!point || Math.abs(point.x) > 500 || Math.abs(point.z) > 325) return null;
    return { x: point.x + 500, y: point.z + 325 };
  }

  private addScenery() {
    const front = FRONTS[this.frontIndex];
    const arid = ["desert", "salt", "basalt", "mountain", "urban", "city"].includes(front.terrain);
    const snow = front.terrain === "snow";
    for (let i = 0; i < 66; i++) {
      const x = 35 + ((i * 167 + 19) % 930), y = 28 + ((i * 127 + 77) % 590);
      let roadDistance = Infinity;
      for (const path of front.paths) for (let j = 1; j < path.length; j++) {
        const a = path[j - 1], b = path[j], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        roadDistance = Math.min(roadDistance, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
      }
      if (roadDistance < 82 || Math.hypot(x - this.hq.x, y - this.hq.y) < 105) continue;
      if (i % 3 === 0 || arid) {
        const rock = new THREE.Mesh(this.effectGeometry, this.workshop.material(snow ? "#d7ded3" : arid ? "#8a826a" : "#686e55"));
        rock.position.set(x - 500, 3, y - 325); rock.scale.set(7 + i % 7, 4 + i % 8, 6 + i % 4);
        rock.rotation.y = i; rock.castShadow = true; this.scene.add(rock);
      } else {
        const height = 22 + i % 16;
        this.workshop.cylinder(this.scene, 2.4, height, [x - 500, height / 2, y - 325], "#5f5846", 6);
        if (front.terrain !== "mud") {
          this.workshop.cylinder(this.scene, 13, height, [x - 500, height + 2, y - 325], snow ? "#a6b6a6" : "#4e6850", 7, 0);
          this.workshop.cylinder(this.scene, 10, height * .8, [x - 500, height * 1.4, y - 325], snow ? "#d5dfd2" : "#617b54", 7, 0);
        } else {
          this.workshop.box(this.scene, [16, 2, 2], [x - 500 + 3, height * .7, y - 325], "#554d3e").rotation.z = -.4;
        }
      }
    }
  }

  private entity(key: string, kind: string, enemy: boolean, rank: number, point: Point, altitude = 0) {
    let entry = this.entities.get(key);
    let previousHeading: THREE.Euler | undefined;
    const library = !enemy ? kind === "air" ? this.patriots : kind === "tank" ? this.abrams : kind === "at" ? this.antiTanks : kind === "mg" ? this.machineGuns : kind === "artillery" ? this.artilleryModels : null : null;
    const detailFlag = kind === "tank" ? "abrams" : kind === "at" ? "antiTank" : kind === "mg" ? "machineGun" : kind === "artillery" ? "artillery" : "patriot";
    if (entry && (entry.kind !== kind || entry.rank !== rank)) {
      previousHeading = entry.model.heading.rotation.clone();
      this.scene.remove(entry.model.root); this.entities.delete(key); entry = undefined;
    }
    if (!entry) {
      entry = { model: library?.create() ?? this.workshop.create(kind, enemy, rank), kind, rank, firedAt: -10 };
      if (previousHeading) entry.model.heading.rotation.copy(previousHeading);
      else if (kind === "tank" && !enemy) entry.model.heading.rotation.y = -this.closestRoad(point).angle;
      this.entities.set(key, entry); this.scene.add(entry.model.root);
    }
    if (library?.ready && !entry.model.root.userData[detailFlag]) {
      const replacement = library.create()!;
      replacement.heading.rotation.copy(entry.model.heading.rotation);
      this.scene.remove(entry.model.root);
      entry.model = replacement;
      this.scene.add(replacement.root);
    }
    entry.model.root.position.set(point.x - 500, altitude, point.y - 325);
    entry.model.root.userData.point = { x: point.x, y: point.y };
    return entry;
  }

  private project(x: number, y: number, altitude = 0) {
    const p = new THREE.Vector3(x - 500, altitude, y - 325).project(this.camera);
    return { x: (p.x + 1) * this.width / 2, y: (1 - p.y) * this.height / 2 };
  }

  private ring(point: Point, radius: number, color: string, fill = false) {
    const ctx = this.overlay; ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * Math.PI * 2, p = this.project(point.x + Math.cos(a) * radius, point.y + Math.sin(a) * radius, 1);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    if (fill) { ctx.save(); ctx.globalAlpha = .08; ctx.fillStyle = color; ctx.fill(); ctx.restore(); }
  }

  private health(point: Point, altitude: number, hp: number, maxHp: number, color: string, label?: string) {
    const p = this.project(point.x, point.y, altitude), ctx = this.overlay;
    const width = label ? 49 : 27;
    ctx.fillStyle = "#0d191ce8"; ctx.fillRect(p.x - width / 2 - 2, p.y - 2, width + 4, 8);
    ctx.fillStyle = hp / maxHp < .3 ? "#ff725f" : color;
    ctx.fillRect(p.x - width / 2, p.y, width * Math.max(0, Math.min(1, hp / maxHp)), 4);
    if (label) {
      ctx.font = "bold 10px Arial"; ctx.textAlign = "center"; ctx.fillStyle = "#0a191be8";
      ctx.fillRect(p.x - 31, p.y - 19, 62, 15); ctx.fillStyle = color; ctx.fillText(label, p.x, p.y - 8);
    }
  }

  render(game: GameState) {
    if (!this.terrainReady) {
      this.terrainReady = this.paintTerrain(this.terrainCanvas.getContext("2d")!);
      this.texture.needsUpdate = true;
    }
    const alive = new Set<string>();
    const hq = this.entity("hq", "hq", false, game.hqDefenseLevel, this.hq); alive.add("hq");
    if (hq.model.rotor) hq.model.rotor.rotation.y = game.gameTime * .6;
    for (const position of game.positions) {
      const key = `p${position.id}`, e = this.entity(key, position.family, false, position.rank, position); alive.add(key);
      const { model } = e;
      if (position.moving) model.heading.rotation.y = -Math.atan2(position.moving.to.y - position.moving.from.y, position.moving.to.x - position.moving.from.x);
      if (model.turret) model.turret.rotation.y = -position.angle - model.heading.rotation.y;
      if (model.rotor) model.rotor.rotation.y = game.gameTime * 2;
      const shot = game.effects.find(f => f.type === "shot" && f.age >= 0 && f.age < .07 &&
        (f.sourceId !== undefined ? f.sourceId === position.id : Math.hypot(f.x - position.x, f.y - position.y) < 8));
      if (shot && shot.id !== e.lastShotId) {
        e.lastShotId = shot.id; e.firedAt = game.gameTime - shot.age;
        if (model.muzzles?.length && model.flashes?.length) {
          model.flashes.forEach(flash => { flash.visible = false; });
          const barrelIndex = ((e.muzzleIndex ?? -1) + 1) % model.muzzles.length;
          e.muzzleIndex = barrelIndex;
          model.muzzle = model.muzzles[barrelIndex]; model.flash = model.flashes[barrelIndex];
        }
      }
      const recoil = Math.max(0, 1 - (game.gameTime - e.firedAt) / .22);
      if (model.barrel) model.barrel.position.x = (model.barrelRestX ?? (position.family === "tank" ? 8 : 0)) - recoil * (model.recoilDistance ?? 3);
      if (model.flash) model.flash.visible = game.gameTime - e.firedAt < .075;
    }
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      const air = Boolean(ENEMIES[enemy.type].air);
      const key = `e${enemy.id}`, e = this.entity(key, enemy.type, true, enemy.tier, enemy, air ? 57 : 0); alive.add(key);
      const path = FRONTS[this.frontIndex].paths[enemy.lane] ?? FRONTS[this.frontIndex].paths[0];
      const segment = Math.min(enemy.segment, path.length - 2);
      const a = air ? path[0] : path[segment], b = air ? path[path.length - 1] : path[segment + 1];
      const targetAngle = -Math.atan2(b.y - a.y, b.x - a.x);
      const difference = Math.atan2(Math.sin(targetAngle - e.model.heading.rotation.y), Math.cos(targetAngle - e.model.heading.rotation.y));
      if (!game.paused) e.model.heading.rotation.y += difference * .2;
      e.model.legs.forEach((leg, i) => { leg.rotation.z = Math.sin(game.gameTime * 10 + enemy.id + i * Math.PI) * .42; });
    }
    for (const sortie of game.sorties) {
      const key = `s${sortie.id}`, e = this.entity(key, sortie.kind, false, 0, sortie, 70); alive.add(key);
      e.model.heading.rotation.y = -sortie.angle;
      if (e.model.rotor) e.model.rotor.children.forEach(propeller => { propeller.rotation.x = game.gameTime * 35; });
    }
    for (const [key, entry] of this.entities) if (!alive.has(key)) { this.scene.remove(entry.model.root); this.entities.delete(key); }
    this.renderEffects(game);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(game);
  }

  private renderEffects(game: GameState) {
    const active = new Set<number>();
    for (const effect of game.effects) {
      if (effect.age < 0) continue; // Impact visuals wait for the missile to arrive.
      if (!["shot", "blast", "air-blast", "hit"].includes(effect.type)) continue;
      active.add(effect.id);
      let group = this.effectObjects.get(effect.id);
      if (!group) {
        group = new THREE.Group(); this.effectObjects.set(effect.id, group); this.scene.add(group);
        if (effect.type === "shot" && effect.weapon === "air") {
          const source = this.entities.get(`p${effect.sourceId}`)?.model;
          const origin = new THREE.Vector3(effect.x - 500, 30, effect.y - 325);
          const direction = new THREE.Vector3((effect.tx ?? effect.x) - effect.x, 100, (effect.ty ?? effect.y) - effect.y).normalize();
          if (source?.launchOrigin) {
            source.root.updateWorldMatrix(true, true);
            source.launchOrigin.getWorldPosition(origin);
            direction.set(1, 0, 0).applyQuaternion(source.launchOrigin.getWorldQuaternion(new THREE.Quaternion()));
          }
          group.add(new MissileFlight(origin, direction, new THREE.Vector3((effect.tx ?? effect.x) - 500, 57, (effect.ty ?? effect.y) - 325)));
        } else if (effect.type === "shot") {
          const origin = new THREE.Vector3(effect.x - 500, 19, effect.y - 325);
          const source = this.entities.get(`p${effect.sourceId}`)?.model;
          if (source?.muzzle) {
            source.root.updateWorldMatrix(true, true);
            source.muzzle.getWorldPosition(origin);
          }
          const geometry = new THREE.BufferGeometry().setFromPoints([
            origin,
            new THREE.Vector3((effect.tx ?? effect.x) - 500, 13, (effect.ty ?? effect.y) - 325),
          ]);
          group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#ffdb81", transparent: true })));
        } else {
          for (let i = 0; i < 9; i++) {
            const mesh = new THREE.Mesh(this.effectGeometry, new THREE.MeshBasicMaterial({ color: i % 3 ? "#ffb14d" : "#7b8275", transparent: true, depthWrite: false }));
            group.add(mesh);
          }
          group.position.set(effect.x - 500, effect.altitude ?? 5, effect.y - 325);
        }
      }
      const t = Math.min(1, effect.age / effect.duration);
      group.children.forEach((child, i) => {
        if (child instanceof MissileFlight) { child.update(t); return; }
        const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        mesh.material.opacity = Math.max(0, (1 - t) * .85);
        if (effect.type !== "shot") {
          const radius = effect.type === "hit" ? 5 : (effect.radius ?? 35) * .5;
          const a = i * 2.4 + effect.id;
          child.position.set(Math.cos(a) * radius * t, i % 3 * 5 + t * 22, Math.sin(a) * radius * t);
          child.scale.setScalar((effect.type === "hit" ? 2 : 7) * (1 + t * 1.8));
        }
      });
    }
    for (const [id, group] of this.effectObjects) if (!active.has(id)) {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      group.traverse(child => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
        if (child.geometry !== this.effectGeometry) geometries.add(child.geometry);
      });
      materials.forEach(material => material.dispose());
      geometries.forEach(geometry => geometry.dispose());
      this.scene.remove(group); this.effectObjects.delete(id);
    }
  }

  private drawOverlay(game: GameState) {
    const ctx = this.overlay; ctx.clearRect(0, 0, this.width, this.height);
    const selected = game.positions.find(p => p.id === game.selectedId);
    let center: Point | undefined, stats: RangeStats | undefined;
    let valid = true;
    if (game.hqSelected && game.hqDefenseLevel) { center = this.hq; stats = { ...HQ_DEFENSE_LEVELS[game.hqDefenseLevel], minRange: 0 }; }
    else if (selected) { center = selected; stats = this.stats(selected); }
    else if (game.pointer && game.buildFamily) {
      const preview = this.placementPreview(game);
      center = preview.point; valid = preview.valid; stats = FAMILIES[game.buildFamily];
    }
    if (center && stats) {
      this.ring(center, stats.range, valid ? "#9ce1ec" : "#ff765b", true);
      if (stats.minRange) this.ring(center, stats.minRange, "#ff9a57", true);
      this.ring(center, 26, valid ? "#f1cf74" : "#ff765b");
      if (game.buildFamily) {
        const p = this.project(center.x, center.y, 35);
        ctx.fillStyle = valid ? "#d9efc6" : "#ffac8a"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center";
        ctx.fillText(valid ? "PLACE POSITION" : "POSITION BLOCKED", p.x, p.y);
      }
    }
    if (game.hqSelected) this.ring(this.hq, 47, "#ffe09c");
    for (const p of game.positions) {
      this.ring(p, p.family === "airbase" ? 49 : 27, p.id === game.selectedId ? "#ffe19a" : "#92b29c88");
      this.health(p, p.family === "airbase" || p.family === "air" ? 64 : 52, p.hp, p.maxHp, "#b3dda4", `${FAMILIES[p.family].short} ${p.rank + 1}${p.veteran ? "+" : ""}`);
    }
    this.health(this.hq, 80, game.hq, game.maxHq, "#e8d18d", `HQ · ${game.hqDefenseLevel}`);
    for (const e of game.enemies) if (!e.dead) this.health(e, ENEMIES[e.type].air ? 80 : 40, e.hp, e.maxHp, "#f2aa86");
    for (const mine of game.mines) this.ring(mine, 9, "#f4bd65", true);
    for (const smoke of game.smokes) {
      const p = this.project(smoke.x, smoke.y, 15), edge = this.project(smoke.x + 90, smoke.y, 15);
      const r = Math.max(10, Math.hypot(edge.x - p.x, edge.y - p.y));
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gradient.addColorStop(0, "#c2cdc875"); gradient.addColorStop(1, "#c2cdc800");
      ctx.fillStyle = gradient; ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
    }
    if (game.pointer && (game.targetSupport || game.redeployId !== null)) {
      const point = game.redeployId !== null || game.targetSupport === "minefield" ? this.closestRoad(game.pointer).point : game.pointer;
      this.ring(point, game.targetSupport === "smoke" ? 90 : 35, "#ffb567", true);
    }
    for (const effect of game.effects) {
      if (effect.type === "air-warning") this.ring(effect, effect.radius ?? 72, "#ff765b", true);
      if (effect.type === "supply") {
        const p = this.project(effect.x, effect.y, 30 + effect.age * 30);
        ctx.save(); ctx.globalAlpha = 1 - effect.age / effect.duration; ctx.font = "bold 11px Arial"; ctx.fillStyle = "#f4dfab"; ctx.fillText("+SUPPLY", p.x, p.y); ctx.restore();
      }
    }
    if (game.paused) {
      ctx.fillStyle = "#0b181b77"; ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "#f4ecd6"; ctx.textAlign = "center"; ctx.font = "bold 22px Arial";
      ctx.fillText("TACTICAL PAUSE", this.width / 2, this.height / 2);
      ctx.font = "13px Arial"; ctx.fillText("Placement and upgrades remain available", this.width / 2, this.height / 2 + 24);
    }
  }

  private closestRoad(point: Point) {
    let nearest = { point, distance: Infinity, angle: 0 };
    for (const path of FRONTS[this.frontIndex].paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const snap = { x: a.x + dx * t, y: a.y + dy * t };
      const distance = Math.hypot(snap.x - point.x, snap.y - point.y);
      if (distance < nearest.distance) nearest = { point: snap, distance, angle: Math.atan2(dy, dx) };
    }
    return nearest;
  }

  private placementPreview(game: GameState) {
    const family = game.buildFamily!, pointer = game.pointer!;
    const road = this.closestRoad(pointer);
    const point = family === "tank" ? road.point : pointer;
    const edge = family === "airbase" ? 58 : 28;
    const inside = point.x >= edge && point.x <= 1000 - edge && point.y >= edge && point.y <= 650 - edge;
    const overlap = game.positions.some(p => Math.hypot(p.x - point.x, p.y - point.y) < (family === "airbase" || p.family === "airbase" ? 70 : 46));
    const roadClear = family === "tank" || road.distance > (family === "airbase" ? 72 : 51);
    return { point, valid: inside && !overlap && roadClear };
  }

  dispose() {
    this.observer.disconnect(); this.canvas.removeEventListener("wheel", this.onWheel);
    // Imported clones share their resources with a prototype owned by the library.
    for (const entry of this.entities.values()) if (entry.model.root.userData.patriot || entry.model.root.userData.abrams || entry.model.root.userData.antiTank || entry.model.root.userData.machineGun || entry.model.root.userData.artillery) this.scene.remove(entry.model.root);
    this.patriots.dispose();
    this.abrams.dispose();
    this.antiTanks.dispose();
    this.machineGuns.dispose();
    this.artilleryModels.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(m => m.dispose());
      }
    });
    this.workshop.dispose(); this.texture.dispose(); this.effectGeometry.dispose();
    this.entities.clear(); this.effectObjects.clear(); this.scene.clear();
    this.renderer.dispose();
  }
}

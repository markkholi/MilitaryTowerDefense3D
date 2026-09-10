"use client";

/* eslint-disable @next/next/no-img-element -- Local game sprites must bypass the unavailable image optimizer in the Sites runtime. */
/* eslint-disable react-hooks/immutability -- The canvas simulation owns one mutable engine model; React renders throttled HUD snapshots. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bomb,
  ChevronRight,
  Crosshair,
  FastForward,
  Info,
  Lock,
  Map,
  Medal,
  Pause,
  Play,
  RotateCw,
  Shield,
  Star,
  Target,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ARMOURY_ITEMS,
  DOCTRINES,
  DOCTRINE_ORDER,
  ENEMIES,
  ENEMY_COMBAT_DAMAGE_SCALE,
  FAMILIES,
  FAMILY_ORDER,
  FRONTS,
  HARDWARE,
  HQ_DEFENSE_LEVELS,
  SUPPORTS,
  enemyStats,
  hardwareFor,
  nextWaveNames,
  placementCost,
  upgradeCost,
  veteranCost,
  waveForFront,
  type Doctrine,
  type EnemyType,
  type FamilyKey,
  type Point,
  type SupportKey,
} from "./game-data";

import { Battlefield3D } from "./battlefield-3d";
import { MISSILE_DURATION, MISSILE_IMPACT_TIME } from "./missile-flight";
import { BattleAudio, type SoundKey } from "./battle-audio";

type Screen = "campaign" | "armoury" | "battle";

type SaveData = {
  version: 2;
  frontStars: number[];
  bestWave: number[];
  purchases: string[];
  sound: boolean;
  volume: number;
  tutorialSeen: boolean;
  endlessBest: number;
  preferredSpeed: 1 | 2 | 3;
};

const SAVE_KEY = "military-tower-defense-3d-save-v1";

const UNIT_ART: Record<FamilyKey, { src: string; drawSize: number }> = {
  mg: { src: "./assets/machine-gun/machine-gun-portrait.png", drawSize: 76 },
  artillery: { src: "./assets/artillery/artillery-portrait.png", drawSize: 86 },
  at: { src: "./assets/anti-tank/anti-tank-portrait.png", drawSize: 76 },
  air: { src: "./assets/patriot/patriot-portrait.png", drawSize: 84 },
  airbase: { src: "./assets/defender-airbase-topdown.png", drawSize: 112 },
  tank: { src: "./assets/abrams/abrams-portrait.png", drawSize: 82 },
};

type SortieKind = "interceptor" | "multirole" | "strike" | "gunship";

const AIRCRAFT_ART: Record<SortieKind, { src: string; drawSize: number }> = {
  interceptor: { src: "./assets/defender-interceptor-topdown.png", drawSize: 56 },
  multirole: { src: "./assets/defender-multirole-topdown.png", drawSize: 56 },
  strike: { src: "./assets/defender-strike-aircraft-topdown.png", drawSize: 58 },
  gunship: { src: "./assets/defender-gunship-topdown.png", drawSize: 70 },
};

const AIRCRAFT_PROFILES: Record<SortieKind, {
  name: string;
  role: string;
  speed: number;
  damage: number;
  splash: number;
  piercing: boolean;
  color: string;
  launchSound: "jet" | "prop";
}> = {
  interceptor: { name: "Interceptor", role: "Air defense", speed: 180, damage: 1.55, splash: 0, piercing: true, color: "#9ae1ef", launchSound: "jet" },
  multirole: { name: "Multirole", role: "Flexible response", speed: 155, damage: 1, splash: .72, piercing: true, color: "#a8c8d7", launchSound: "jet" },
  strike: { name: "Strike Jet", role: "Armour attack", speed: 130, damage: 1.28, splash: 1.18, piercing: true, color: "#e0bd78", launchSound: "jet" },
  gunship: { name: "Gunship", role: "Anti-infantry", speed: 92, damage: .74, splash: 1.72, piercing: false, color: "#b5b98c", launchSound: "prop" },
};

const ENEMY_ART: Record<EnemyType, { src: string; drawSize: number }> = {
  infantry: { src: "./assets/enemy-infantry-topdown.png", drawSize: 40 },
  scout: { src: "./assets/enemy-scout-ugv-topdown.png", drawSize: 46 },
  brute: { src: "./assets/enemy-brute-topdown.png", drawSize: 48 },
  slinger: { src: "./assets/enemy-rpg-topdown.png", drawSize: 43 },
  bomber: { src: "./assets/enemy-strike-drone-topdown.png", drawSize: 60 },
  bulwark: { src: "./assets/enemy-bulwark-ifv-topdown.png", drawSize: 64 },
  swarmling: { src: "./assets/enemy-raider-topdown.png", drawSize: 31 },
  siege: { src: "./assets/enemy-siege-tank-topdown.png", drawSize: 80 },
};

const FRONT_ART: Record<string, string> = {
  verdun: "./assets/maps/verdun-mud.webp",
  "el-alamein": "./assets/maps/el-alamein-desert.webp",
  imjin: "./assets/maps/imjin-ridge.webp",
  "khe-sanh": "./assets/maps/khe-sanh-jungle.webp",
  golan: "./assets/maps/golan-basalt.webp",
  khafji: "./assets/maps/khafji-salt-flat.webp",
  mogadishu: "./assets/maps/mogadishu-urban.webp",
  "tora-bora": "./assets/maps/tora-bora-mountain.webp",
  fallujah: "./assets/maps/fallujah-city.webp",
  marjah: "./assets/maps/marjah-farmland.webp",
  kyiv: "./assets/maps/kyiv-winter.webp",
};

const HQ_ART = { src: "./assets/hq-command-post-topdown.png", drawSize: 116 };

const DEFAULT_SAVE: SaveData = {
  version: 2,
  frontStars: FRONTS.map(() => 0),
  bestWave: FRONTS.map(() => 0),
  purchases: [],
  sound: true,
  volume: .65,
  tutorialSeen: false,
  endlessBest: 0,
  preferredSpeed: 1,
};

function normalizeSave(input: unknown): SaveData {
  if (!input || typeof input !== "object") return DEFAULT_SAVE;
  const candidate = input as Partial<SaveData>;
  const preferredSpeed = candidate.preferredSpeed === 2 || candidate.preferredSpeed === 3 ? candidate.preferredSpeed : 1;
  return {
    version: 2,
    frontStars: FRONTS.map((_, index) => Math.max(0, Math.min(3, Number(candidate.frontStars?.[index] ?? 0)))),
    bestWave: FRONTS.map((_, index) => Math.max(0, Number(candidate.bestWave?.[index] ?? 0))),
    purchases: Array.isArray(candidate.purchases)
      ? candidate.purchases.filter((id): id is string => ARMOURY_ITEMS.some((item) => item.id === id))
      : [],
    sound: candidate.sound !== false,
    volume: typeof candidate.volume === "number" && Number.isFinite(candidate.volume) ? Math.max(0, Math.min(1, candidate.volume)) : .65,
    tutorialSeen: candidate.tutorialSeen === true,
    endlessBest: Math.max(0, Number(candidate.endlessBest ?? 0)),
    preferredSpeed,
  };
}

function totalStars(save: SaveData) {
  return save.frontStars.reduce((sum, stars) => sum + stars, 0);
}

function spentStars(save: SaveData) {
  return save.purchases.reduce(
    (sum, id) => sum + (ARMOURY_ITEMS.find((item) => item.id === id)?.cost ?? 0),
    0,
  );
}

function Stars({ count, dim = false }: { count: number; dim?: boolean }) {
  return (
    <span className="stars" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((index) => (
        <Star key={index} aria-hidden="true" className={index < count && !dim ? "star-filled" : "star-empty"} />
      ))}
    </span>
  );
}

function Emblem() {
  return (
    <span className="brand-emblem" aria-hidden="true">
      <span className="emblem-ring" />
      <Crosshair />
    </span>
  );
}

export default function MilitaryTowerDefense() {
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("campaign");
  const [frontIndex, setFrontIndex] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [endless, setEndless] = useState(false);

  useEffect(() => {
    let restored = DEFAULT_SAVE;
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) restored = normalizeSave(JSON.parse(raw));
    } catch {
      // A blocked or damaged local save should never block play.
    }
    window.queueMicrotask(() => {
      setSave(restored);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Progress remains usable for this session if storage is unavailable.
    }
  }, [hydrated, save]);

  const launchFront = useCallback((index: number) => {
    setFrontIndex(index);
    setEndless(false);
    setRunKey((value) => value + 1);
    setScreen("battle");
  }, []);

  const launchEndless = useCallback(() => {
    setFrontIndex(FRONTS.length - 1);
    setEndless(true);
    setRunKey((value) => value + 1);
    setScreen("battle");
  }, []);

  const finishFront = useCallback((index: number, stars: number, wave: number, sawTutorial: boolean) => {
    setSave((current) => {
      const frontStars = [...current.frontStars];
      const bestWave = [...current.bestWave];
      frontStars[index] = Math.max(frontStars[index] ?? 0, stars);
      bestWave[index] = Math.max(bestWave[index] ?? 0, wave);
      return {
        ...current,
        frontStars,
        bestWave,
        tutorialSeen: current.tutorialSeen || sawTutorial,
      };
    });
  }, []);

  const toggleSound = useCallback(() => {
    setSave((current) => ({ ...current, sound: !current.sound }));
  }, []);

  const rememberSpeed = useCallback((preferredSpeed: 1 | 2 | 3) => {
    setSave((current) => ({ ...current, preferredSpeed }));
  }, []);

  const rememberVolume = useCallback((volume: number) => {
    setSave((current) => ({ ...current, volume }));
  }, []);

  const finishEndless = useCallback((wave: number) => {
    setSave((current) => ({ ...current, endlessBest: Math.max(current.endlessBest, wave) }));
  }, []);

  if (screen === "battle") {
    return (
      <Battle
        key={`${frontIndex}-${runKey}`}
        frontIndex={frontIndex}
        endless={endless}
        save={save}
        onExit={() => setScreen("campaign")}
        onRetry={() => setRunKey((value) => value + 1)}
        onFinish={finishFront}
        onFinishEndless={finishEndless}
        onToggleSound={toggleSound}
        onSpeedChange={rememberSpeed}
        onVolumeChange={rememberVolume}
      />
    );
  }

  if (screen === "armoury") {
    return (
      <ArmouryScreen
        save={save}
        onChange={setSave}
        onBack={() => setScreen("campaign")}
      />
    );
  }

  return (
    <CampaignScreen
      save={save}
      onLaunch={launchFront}
      onArmoury={() => setScreen("armoury")}
      onEndless={launchEndless}
      onToggleSound={toggleSound}
    />
  );
}

function CampaignScreen({
  save,
  onLaunch,
  onArmoury,
  onEndless,
  onToggleSound,
}: {
  save: SaveData;
  onLaunch: (index: number) => void;
  onArmoury: () => void;
  onEndless: () => void;
  onToggleSound: () => void;
}) {
  const earned = totalStars(save);
  const available = earned - spentStars(save);
  const maximumStars = FRONTS.length * 3;

  return (
    <main className="campaign-shell">
      <header className="campaign-header">
        <div className="brand-lockup">
          <Emblem />
          <div>
            <p>Field Command</p>
            <h1>Military Tower Defense <span className="edition-badge">3D</span></h1>
          </div>
        </div>
        <div className="header-actions">
          <div className="star-wallet" title="Unspent stars">
            <Star aria-hidden="true" />
            <strong>{available}</strong>
            <span>available</span>
          </div>
          <button className="icon-button" onClick={onToggleSound} aria-label={save.sound ? "Mute sound" : "Turn sound on"}>
            {save.sound ? <Volume2 /> : <VolumeX />}
          </button>
          <button className="armoury-button" onClick={onArmoury}>
            <Wrench aria-hidden="true" />
            Armoury
          </button>
        </div>
      </header>

      <section className="campaign-intro">
        <div>
          <span className="eyebrow">Campaign route · 1916—2022</span>
          <h2>Command the battlefield in 3D</h2>
          <p>Eleven historic fronts. Combined arms. One line to hold. Deploy your defenses and command a century of military hardware.</p>
        </div>
        <div className="campaign-progress" aria-label={`${earned} of ${maximumStars} campaign stars earned`}>
          <span>{earned}</span>
          <small>/ {maximumStars} stars</small>
          <div className="progress-track"><i style={{ width: `${(earned / maximumStars) * 100}%` }} /></div>
        </div>
      </section>

      <section className="front-route" aria-label="Campaign fronts">
        <div className="route-line" aria-hidden="true" />
        {FRONTS.map((front, index) => {
          const unlocked = index === 0 || save.frontStars[index - 1] > 0;
          const stars = save.frontStars[index] ?? 0;
          return (
            <article
              className={`front-card terrain-${front.terrain} ${unlocked ? "is-unlocked" : "is-locked"} ${stars ? "is-cleared" : ""}`}
              key={front.id}
              style={{ "--front-map": `url(${FRONT_ART[front.id]})` } as React.CSSProperties}
            >
              <div className="front-marker" aria-hidden="true">
                {unlocked ? (stars ? <Medal /> : <span>{String(index + 1).padStart(2, "0")}</span>) : <Lock />}
              </div>
              <div className="front-card-main">
                <div className="front-kicker">
                  <span>Front {String(index + 1).padStart(2, "0")}</span>
                  <span>{front.theatre}</span>
                </div>
                <div className="front-title-row">
                  <div>
                    <h3>{front.name}</h3>
                    <p>{front.place} · {front.year}</p>
                  </div>
                  <Stars count={stars} dim={!unlocked} />
                </div>
                <div className="front-intel">
                  <Target aria-hidden="true" />
                  <p><strong>Threat:</strong> {front.threat}</p>
                </div>
                <div className="front-meta">
                  <span>{front.waveCount} waves</span>
                  <span>{front.paths.length} {front.paths.length === 1 ? "lane" : "lanes"}</span>
                  <span>Best {save.bestWave[index] || "—"}</span>
                </div>
              </div>
              <button
                className="deploy-button"
                disabled={!unlocked}
                onClick={() => unlocked && onLaunch(index)}
                aria-label={unlocked ? `Deploy to ${front.place}` : `${front.place} is locked`}
              >
                {unlocked ? <><span>{stars ? "Replay" : "Deploy"}</span><ChevronRight /></> : <><Lock /><span>Locked</span></>}
              </button>
            </article>
          );
        })}
        {save.frontStars[FRONTS.length - 1] > 0 && (
          <article className="front-card endless-card is-unlocked">
            <div className="front-marker" aria-hidden="true"><FastForward /></div>
            <div className="front-card-main">
              <div className="front-kicker"><span>War game</span><span>Open-ended command</span></div>
              <div className="front-title-row">
                <div><h3>Endless defense</h3><p>{FRONTS[FRONTS.length - 1].place} proving ground · no wave limit</p></div>
              </div>
              <div className="front-intel"><Target aria-hidden="true" /><p><strong>Escalation:</strong> repeating combined-arms patterns with rising tiers and group sizes without a ceiling.</p></div>
              <div className="front-meta"><span>Best wave {save.endlessBest || "—"}</span><span>Infinite veteran sink</span></div>
            </div>
            <button className="deploy-button" onClick={onEndless}><span>Enter</span><ChevronRight /></button>
          </article>
        )}
      </section>

      <footer className="campaign-footer">
        <Shield aria-hidden="true" />
        Progress is stored on this device. No account or connection is required to play.
      </footer>
    </main>
  );
}

function ArmouryScreen({
  save,
  onChange,
  onBack,
}: {
  save: SaveData;
  onChange: (save: SaveData) => void;
  onBack: () => void;
}) {
  const earned = totalStars(save);
  const spent = spentStars(save);
  const available = earned - spent;

  function toggleItem(id: string) {
    const item = ARMOURY_ITEMS.find((entry) => entry.id === id);
    if (!item) return;
    const owned = save.purchases.includes(id);
    if (!owned && (item.cost > available || (item.requirement && !save.purchases.includes(item.requirement)))) return;
    onChange({
      ...save,
      purchases: owned ? save.purchases.filter((entry) => entry !== id) : [...save.purchases, id],
    });
  }

  const columns: Array<{ id: "tech" | "command" | "arsenal"; title: string; subtitle: string }> = [
    { id: "tech", title: "Tech", subtitle: "Modern doctrine tiers" },
    { id: "command", title: "Command", subtitle: "Small permanent advantages" },
    { id: "arsenal", title: "Arsenal", subtitle: "New support powers" },
  ];

  return (
    <main className="armoury-shell">
      <header className="subpage-header">
        <button className="back-button" onClick={onBack}><ArrowLeft /> Campaign</button>
        <div className="subpage-title">
          <span>Permanent command upgrades</span>
          <h1>Armoury</h1>
        </div>
        <div className="star-wallet armoury-wallet">
          <Star aria-hidden="true" />
          <strong>{available}</strong>
          <span>available</span>
        </div>
      </header>

      <section className="armoury-lead">
        <div>
          <p className="eyebrow">Specialise your campaign</p>
          <h2>Every purchase is a choice.</h2>
          <p>The catalogue costs 22 stars; the campaign awards 18. Tap any owned upgrade to refund it instantly and for free.</p>
        </div>
        <div className="armoury-meter">
          <div><span>Earned</span><strong>{earned}</strong></div>
          <div><span>Committed</span><strong>{spent}</strong></div>
          <div><span>Catalogue</span><strong>22</strong></div>
        </div>
      </section>

      <section className="armoury-columns">
        {columns.map((column) => (
          <div className={`armoury-column column-${column.id}`} key={column.id}>
            <div className="armoury-column-heading">
              {column.id === "tech" ? <Crosshair /> : column.id === "command" ? <Medal /> : <Bomb />}
              <div><h2>{column.title}</h2><p>{column.subtitle}</p></div>
            </div>
            <div className="armoury-list">
              {ARMOURY_ITEMS.filter((item) => item.column === column.id).map((item) => {
                const owned = save.purchases.includes(item.id);
                const requirementMet = !item.requirement || save.purchases.includes(item.requirement);
                const affordable = item.cost <= available;
                return (
                  <button
                    key={item.id}
                    className={`armoury-item ${owned ? "is-owned" : ""}`}
                    onClick={() => toggleItem(item.id)}
                    disabled={!owned && (!affordable || !requirementMet)}
                  >
                    <span className="armoury-item-state">{owned ? "Active" : requirementMet ? `${item.cost} ★` : "Rank I required"}</span>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    <span className="armoury-item-action">{owned ? "Tap to refund" : affordable && requirementMet ? "Purchase" : "Unavailable"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="refund-note"><RotateCw /> Free, unlimited refunds keep every experiment reversible.</div>
    </main>
  );
}

export type Position = {
  id: number;
  family: FamilyKey;
  x: number;
  y: number;
  rank: number;
  doctrine?: Doctrine;
  veteran: number;
  cooldown: number;
  angle: number;
  hp: number;
  maxHp: number;
  kills: number;
  failedAt: number;
  moving?: {
    from: Point;
    to: Point;
    elapsed: number;
    duration: number;
  };
};

type Enemy = {
  id: number;
  type: EnemyType;
  tier: number;
  lane: number;
  x: number;
  y: number;
  segment: number;
  segmentT: number;
  travelled: number;
  totalDistance: number;
  hp: number;
  maxHp: number;
  armor: number;
  reward: number;
  speed: number;
  attackCooldown: number;
  slowUntil: number;
  slowFactor: number;
  dead: boolean;
};

type Sortie = {
  id: number;
  sourceId: number;
  targetId: number;
  kind: SortieKind;
  phase: "outbound" | "returning";
  x: number;
  y: number;
  angle: number;
  damage: number;
  splash: number;
  speed: number;
  piercing: boolean;
  complete: boolean;
};

type Effect = {
  id: number;
  type: "shot" | "blast" | "deadzone" | "hit" | "air-warning" | "air-blast" | "supply";
  x: number;
  y: number;
  tx?: number;
  ty?: number;
  age: number;
  duration: number;
  radius?: number;
  color?: string;
  triggered?: boolean;
  weapon?: FamilyKey;
  sourceId?: number;
  altitude?: number;
};

type SmokeZone = { id: number; x: number; y: number; expires: number };
type Mine = { id: number; x: number; y: number };
type SpawnEntry = { at: number; type: EnemyType; tier: number; lane: number };
type Phase = "build" | "active" | "victory" | "defeat";

export type GameState = {
  supply: number;
  hq: number;
  maxHq: number;
  hqDefenseLevel: number;
  hqDefenseCooldown: number;
  hqKills: number;
  hqSelected: boolean;
  wave: number;
  phase: Phase;
  buildCountdown: number;
  speed: 1 | 2 | 3;
  paused: boolean;
  gameTime: number;
  realTime: number;
  waveStartedAt: number;
  positions: Position[];
  enemies: Enemy[];
  spawnQueue: SpawnEntry[];
  effects: Effect[];
  smokes: SmokeZone[];
  mines: Mine[];
  sorties: Sortie[];
  selectedId: number | null;
  buildFamily: FamilyKey | null;
  targetSupport: SupportKey | null;
  redeployId: number | null;
  pointer: Point | null;
  supportCooldowns: Record<SupportKey, number>;
  supportUses: Record<SupportKey, number>;
  overdriveUntil: number;
  incomeCarry: number;
  ended: boolean;
  endlessMode: boolean;
  discoveredDeadZone: boolean;
  nextId: number;
};

type HudState = {
  supply: number;
  hq: number;
  wave: number;
  phase: Phase;
  countdown: number;
  speed: 1 | 2 | 3;
  paused: boolean;
  enemies: number;
  cooldowns: Record<SupportKey, number>;
  uses: Record<SupportKey, number>;
};

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function placementSeparation(a: FamilyKey, b?: FamilyKey) {
  return a === "airbase" || b === "airbase" ? 70 : 46;
}

function hqLocation(frontIndex: number): Point {
  const path = FRONTS[frontIndex].paths[0];
  const endpoint = path[path.length - 1];
  return {
    x: Math.min(940, endpoint.x - 26),
    y: Math.max(64, Math.min(586, endpoint.y)),
  };
}

function chooseSortieKind(target: Enemy, enemies: Enemy[], launchId: number): SortieKind {
  if (ENEMIES[target.type].air) return launchId % 4 === 0 ? "multirole" : "interceptor";
  if (target.armor >= 8) return "strike";
  const clusteredGround = enemies.filter((enemy) => !enemy.dead && !ENEMIES[enemy.type].air && distance(enemy, target) < 72).length;
  if (clusteredGround >= 3) return "gunship";
  return "multirole";
}

function advanceSortie(sortie: Sortie, destination: Point, travel: number) {
  const dx = destination.x - sortie.x;
  const dy = destination.y - sortie.y;
  const gap = Math.hypot(dx, dy);
  sortie.angle = Math.atan2(dy, dx);
  if (gap <= travel || gap < 1) {
    sortie.x = destination.x;
    sortie.y = destination.y;
    return true;
  }
  sortie.x += (dx / gap) * travel;
  sortie.y += (dy / gap) * travel;
  return false;
}

function pathLength(path: Point[]) {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) total += distance(path[index], path[index + 1]);
  return total;
}

function nearestOnSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return { point: { x: start.x + dx * t, y: start.y + dy * t }, t };
}

function nearestOnPaths(point: Point, paths: Point[][]) {
  let best = { point: paths[0][0], distance: Number.POSITIVE_INFINITY, lane: 0 };
  paths.forEach((path, lane) => {
    for (let index = 0; index < path.length - 1; index += 1) {
      const projected = nearestOnSegment(point, path[index], path[index + 1]).point;
      const gap = distance(point, projected);
      if (gap < best.distance) best = { point: projected, distance: gap, lane };
    }
  });
  return best;
}

function shallowHudEqual(a: HudState, b: HudState) {
  return a.supply === b.supply && a.hq === b.hq && a.wave === b.wave && a.phase === b.phase
    && a.countdown === b.countdown && a.speed === b.speed && a.paused === b.paused
    && a.enemies === b.enemies
    && (Object.keys(a.cooldowns) as SupportKey[]).every((key) => a.cooldowns[key] === b.cooldowns[key] && a.uses[key] === b.uses[key]);
}

function getPositionStats(position: Position, positions: Position[], gameTime: number, overdriveUntil: number) {
  const family = FAMILIES[position.family];
  let damage = family.damage;
  let range = family.range;
  let minRange = family.minRange;
  let cooldown = family.cooldown;
  let splash = family.splash;
  let maxHp = family.maxHp;
  let slow = 0;
  let income = 0;

  if (position.rank >= 1) {
    damage *= 1.28;
    range *= 1.1;
    cooldown /= 1.08;
    maxHp *= 1.22;
    splash *= 1.08;
  }

  const doctrineRank = position.doctrine ? Math.max(0, position.rank - 1) : 0;
  if (position.doctrine === "firepower") {
    damage *= [1, 1.34, 1.76, 2.34][doctrineRank];
    splash *= [1, 1.12, 1.28, 1.48][doctrineRank];
  }
  if (position.doctrine === "optics") {
    range *= [1, 1.25, 1.5, 1.8][doctrineRank];
    minRange *= [1, 0.96, 0.9, 0.84][doctrineRank];
    damage *= [1, 1.04, 1.1, 1.18][doctrineRank];
  }
  if (position.doctrine === "mobility") {
    cooldown /= [1, 1.25, 1.56, 1.92][doctrineRank];
    slow = [0, 0.12, 0.2, 0.28][doctrineRank];
  }
  if (position.doctrine === "logistics") {
    cooldown /= [1, 1.08, 1.16, 1.24][doctrineRank];
    income = [0, 1.7, 3.1, 5.2][doctrineRank];
  }

  damage *= Math.pow(1.08, position.veteran);
  range *= Math.pow(1.03, position.veteran);
  maxHp *= Math.pow(1.07, position.veteran);

  let auraRate = 0;
  for (const ally of positions) {
    if (ally.id === position.id || ally.doctrine !== "logistics" || ally.rank < 2 || ally.moving) continue;
    if (distance(position, ally) > 168) continue;
    auraRate += [0, 0.08, 0.14, 0.21][Math.max(0, ally.rank - 1)];
  }
  cooldown /= 1 + Math.min(0.45, auraRate);
  if (gameTime < overdriveUntil) cooldown /= 2;

  return { damage, range, minRange, cooldown, splash, maxHp, slow, income };
}

function moveAlongPath(enemy: Enemy, path: Point[], travel: number) {
  let remaining = travel;
  while (remaining > 0 && enemy.segment < path.length - 1) {
    const start = path[enemy.segment];
    const end = path[enemy.segment + 1];
    const segmentLength = distance(start, end);
    const available = segmentLength * (1 - enemy.segmentT);
    if (remaining < available) {
      enemy.segmentT += remaining / segmentLength;
      enemy.travelled += remaining;
      remaining = 0;
    } else {
      enemy.travelled += available;
      remaining -= available;
      enemy.segment += 1;
      enemy.segmentT = 0;
    }
  }
  if (enemy.segment >= path.length - 1) {
    const end = path[path.length - 1];
    enemy.x = end.x;
    enemy.y = end.y;
    return true;
  }
  const start = path[enemy.segment];
  const end = path[enemy.segment + 1];
  enemy.x = start.x + (end.x - start.x) * enemy.segmentT;
  enemy.y = start.y + (end.y - start.y) * enemy.segmentT;
  return false;
}

type TerrainPalette = {
  ground: string;
  deep: string;
  line: string;
  road: string;
  roadEdge: string;
  roadShoulder: string;
  roadCrown: string;
  roadWear: string;
};

const TERRAIN_COLORS: Record<string, TerrainPalette> = {
  mud: { ground: "#3b4439", deep: "#2d342e", line: "#68705a", road: "#6d6552", roadEdge: "#242a26", roadShoulder: "#49483b", roadCrown: "rgba(178, 164, 124, .18)", roadWear: "rgba(30, 28, 23, .56)" },
  desert: { ground: "#72694e", deep: "#5a523e", line: "#9a8b62", road: "#9d8561", roadEdge: "#433e31", roadShoulder: "#74664d", roadCrown: "rgba(235, 210, 154, .2)", roadWear: "rgba(82, 66, 45, .42)" },
  ridge: { ground: "#465044", deep: "#333c35", line: "#71806c", road: "#706959", roadEdge: "#242b28", roadShoulder: "#4d4e43", roadCrown: "rgba(190, 181, 155, .16)", roadWear: "rgba(35, 34, 30, .52)" },
  jungle: { ground: "#263e31", deep: "#1d2e25", line: "#4f7257", road: "#665f4c", roadEdge: "#14221b", roadShoulder: "#3a4234", roadCrown: "rgba(177, 163, 118, .15)", roadWear: "rgba(27, 27, 21, .58)" },
  lava: { ground: "#554c3d", deep: "#3e392f", line: "#81725a", road: "#706354", roadEdge: "#292621", roadShoulder: "#4b4438", roadCrown: "rgba(188, 165, 127, .14)", roadWear: "rgba(31, 28, 25, .56)" },
  salt: { ground: "#777664", deep: "#5f6156", line: "#a1a08b", road: "#8b806b", roadEdge: "#41423b", roadShoulder: "#686758", roadCrown: "rgba(226, 221, 188, .19)", roadWear: "rgba(70, 65, 54, .43)" },
  urban: { ground: "#71685e", deep: "#554d46", line: "#a09689", road: "#837768", roadEdge: "#36322f", roadShoulder: "#60574e", roadCrown: "rgba(228, 214, 190, .17)", roadWear: "rgba(57, 51, 46, .5)" },
  mountain: { ground: "#5b5c55", deep: "#41443f", line: "#86877c", road: "#756c5a", roadEdge: "#30322f", roadShoulder: "#555247", roadCrown: "rgba(211, 202, 174, .15)", roadWear: "rgba(42, 41, 37, .52)" },
  city: { ground: "#796754", deep: "#5a493c", line: "#a78d70", road: "#92785d", roadEdge: "#3c342c", roadShoulder: "#6b5847", roadCrown: "rgba(235, 211, 171, .17)", roadWear: "rgba(70, 53, 40, .5)" },
  farmland: { ground: "#596048", deep: "#3f4939", line: "#7b8564", road: "#766a50", roadEdge: "#2e342a", roadShoulder: "#55533f", roadCrown: "rgba(209, 191, 143, .15)", roadWear: "rgba(42, 39, 31, .5)" },
  snow: { ground: "#7d807b", deep: "#555b58", line: "#aeb4ae", road: "#6f6960", roadEdge: "#343836", roadShoulder: "#53554f", roadCrown: "rgba(224, 229, 221, .18)", roadWear: "rgba(41, 42, 40, .55)" },
};

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function traceRoad(ctx: CanvasRenderingContext2D, path: Point[]) {
  ctx.beginPath();
  path.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
}

function traceOffsetRoad(ctx: CanvasRenderingContext2D, path: Point[], offset: number, seed: number) {
  ctx.beginPath();
  path.forEach((point, index) => {
    const before = path[Math.max(0, index - 1)];
    const after = path[Math.min(path.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const jitter = Math.sin(seed * 1.91 + index * 2.73) * .8;
    const x = point.x - (dy / length) * (offset + jitter);
    const y = point.y + (dx / length) * (offset + jitter);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function roadNoise(seed: number, value: number, salt = 0) {
  const raw = Math.sin(seed * 91.17 + value * 17.31 + salt * 43.77) * 43758.5453;
  return raw - Math.floor(raw);
}

function drawRoadSurface(
  ctx: CanvasRenderingContext2D,
  path: Point[],
  palette: TerrainPalette,
  terrain: string,
  seed: number,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(3, 5, 4, .68)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = "rgba(7, 9, 7, .55)";
  ctx.lineWidth = 66;
  traceRoad(ctx, path);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = palette.roadEdge;
  ctx.lineWidth = 60;
  traceRoad(ctx, path);
  ctx.stroke();

  ctx.strokeStyle = palette.roadShoulder;
  ctx.lineWidth = 54;
  traceRoad(ctx, path);
  ctx.stroke();

  ctx.strokeStyle = palette.road;
  ctx.lineWidth = 44;
  traceRoad(ctx, path);
  ctx.stroke();

  ctx.strokeStyle = palette.roadCrown;
  ctx.lineWidth = 12;
  traceRoad(ctx, path);
  ctx.stroke();

  ctx.strokeStyle = palette.roadWear;
  ctx.lineWidth = 2.15;
  ctx.globalAlpha = .76;
  traceOffsetRoad(ctx, path, -10, seed);
  ctx.stroke();
  traceOffsetRoad(ctx, path, 10, seed + 3);
  ctx.stroke();

  ctx.strokeStyle = "rgba(238, 221, 172, .1)";
  ctx.lineWidth = .9;
  traceOffsetRoad(ctx, path, -8.3, seed + 7);
  ctx.stroke();
  traceOffsetRoad(ctx, path, 11.7, seed + 11);
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const normalX = -dy / length;
    const normalY = dx / length;

    const firstMark = 16 + ((seed * 13 + index * 11) % 17);
    for (let along = firstMark, mark = 0; along < length - 12; along += 19 + ((mark + seed) % 3) * 3, mark += 1) {
      const progress = along / length;
      const grain = roadNoise(seed + index, mark, 1);
      const lateral = (grain * 2 - 1) * 17;
      const x = start.x + dx * progress + normalX * lateral;
      const y = start.y + dy * progress + normalY * lateral;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx) + (grain - .5) * .36);
      ctx.fillStyle = grain > .5 ? palette.roadWear : "rgba(239, 223, 176, .13)";
      ctx.globalAlpha = .34 + roadNoise(seed + index, mark, 2) * .35;
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.2 + grain * 2.2, .7 + grain, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (mark % 5 === 0) {
        const wet = terrain === "mud" || terrain === "jungle" || terrain === "farmland" || terrain === "snow";
        const dusty = terrain === "desert" || terrain === "salt" || terrain === "urban" || terrain === "mountain" || terrain === "city";
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = wet
          ? "rgba(20, 27, 23, .35)"
          : dusty
            ? "rgba(230, 211, 164, .13)"
            : "rgba(26, 27, 24, .24)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 6 + roadNoise(seed, mark, 3) * 4, 1.8 + roadNoise(seed, mark, 4) * 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (wet) {
          ctx.strokeStyle = "rgba(218, 220, 190, .15)";
          ctx.lineWidth = .8;
          ctx.beginPath();
          ctx.moveTo(-4, -1); ctx.lineTo(3, -1);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (let along = 12, edgeMark = 0; along < length - 8; along += 28, edgeMark += 1) {
      const progress = along / length;
      const side = (edgeMark + index + seed) % 2 === 0 ? -1 : 1;
      const edgeNoise = roadNoise(seed + index, edgeMark, 5);
      const lateral = side * (25 + edgeNoise * 3.5);
      const x = start.x + dx * progress + normalX * lateral;
      const y = start.y + dy * progress + normalY * lateral;
      ctx.fillStyle = edgeNoise > .55 ? palette.roadEdge : palette.roadShoulder;
      ctx.globalAlpha = .45 + edgeNoise * .35;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.2 + edgeNoise * 2.4, .9 + edgeNoise * 1.5, Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRangeRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  maxRange: number,
  minRange: number,
  valid = true,
) {
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = valid ? "rgba(126, 208, 223, .95)" : "rgba(239, 105, 71, .95)";
  ctx.fillStyle = valid ? "rgba(126, 208, 223, .07)" : "rgba(239, 105, 71, .08)";
  ctx.beginPath();
  ctx.arc(x, y, maxRange, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (minRange > 0) {
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(242, 144, 75, .95)";
    ctx.fillStyle = "rgba(191, 70, 49, .16)";
    ctx.beginPath();
    ctx.arc(x, y, minRange, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 196, 112, .9)";
    ctx.font = "700 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText("DEAD ZONE", x, y - minRange - 7);
  }
  ctx.restore();
}

function drawTargetReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  const corner = Math.max(10, Math.min(20, radius * .24));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const horizontal of [-1, 1]) {
    for (const vertical of [-1, 1]) {
      const cornerX = x + horizontal * radius;
      const cornerY = y + vertical * radius;
      ctx.beginPath();
      ctx.moveTo(cornerX - horizontal * corner, cornerY);
      ctx.lineTo(cornerX, cornerY);
      ctx.lineTo(cornerX, cornerY - vertical * corner);
      ctx.stroke();
    }
  }

  const inner = 7;
  const outer = 18;
  ctx.beginPath();
  ctx.moveTo(x - outer, y); ctx.lineTo(x - inner, y);
  ctx.moveTo(x + inner, y); ctx.lineTo(x + outer, y);
  ctx.moveTo(x, y - outer); ctx.lineTo(x, y - inner);
  ctx.moveTo(x, y + inner); ctx.lineTo(x, y + outer);
  ctx.stroke();
  ctx.restore();
}

function drawUnitSeparation(
  ctx: CanvasRenderingContext2D,
  radius: number,
  accent: string,
  selected = false,
  airborne = false,
  showRing = true,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, .82)";
  ctx.shadowBlur = airborne ? 14 : 10;
  ctx.shadowOffsetY = airborne ? 8 : 5;
  ctx.fillStyle = airborne ? "rgba(7, 13, 14, .42)" : "rgba(5, 7, 6, .5)";
  ctx.beginPath();
  ctx.ellipse(2, airborne ? 7 : 4, radius * .92, radius * (airborne ? .42 : .58), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (showRing) {
    ctx.strokeStyle = "rgba(2, 4, 3, .92)";
    ctx.lineWidth = selected ? 5.5 : 4.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * .74, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = selected ? .98 : .8;
    ctx.strokeStyle = accent;
    ctx.lineWidth = selected ? 2.5 : 1.75;
    ctx.setLineDash(airborne ? [7, 4] : [5, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * .74, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawUpgradeIndicator(
  ctx: CanvasRenderingContext2D,
  rank: number,
  veteran: number,
  doctrine: Doctrine | undefined,
  artReady: boolean,
) {
  const filled = Math.min(4, rank);
  const width = veteran > 0 ? 72 : 60;
  const top = artReady ? -64 : -45;
  const accent = doctrine ? DOCTRINES[doctrine].color : "#e6cb72";

  ctx.save();
  ctx.fillStyle = "rgba(5, 8, 6, .9)";
  ctx.strokeStyle = "rgba(232, 224, 187, .42)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, -width / 2, top, width, 21, 7);
  ctx.fill();
  ctx.stroke();

  for (let index = 0; index < 4; index += 1) {
    ctx.fillStyle = index < filled ? accent : "rgba(199, 207, 190, .2)";
    drawRoundedRect(ctx, -17.5 + index * 9, top + 4, 8, 4, 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(246, 244, 226, .92)";
  ctx.font = "800 7px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(veteran > 0 ? `UPG ${filled}/4 · V${veteran}` : `UPG ${filled}/4`, 0, top + 15);
  ctx.restore();
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  frontIndex: number,
  unitSprites: Partial<Record<FamilyKey, HTMLImageElement>>,
  enemySprites: Partial<Record<EnemyType, HTMLImageElement>>,
  terrainImage: HTMLImageElement | null,
  hqSprite: HTMLImageElement | null,
  aircraftSprites: Partial<Record<SortieKind, HTMLImageElement>>,
  terrainOnly = false,
) {
  const front = FRONTS[frontIndex];
  const palette = TERRAIN_COLORS[front.terrain];
  ctx.clearRect(0, 0, 1000, 650);
  const terrainReady = Boolean(terrainImage?.complete && terrainImage.naturalWidth > 0);
  if (terrainReady && terrainImage) {
    const sourceAspect = terrainImage.naturalWidth / terrainImage.naturalHeight;
    const targetAspect = 1000 / 650;
    let sx = 0;
    let sy = 0;
    let sw = terrainImage.naturalWidth;
    let sh = terrainImage.naturalHeight;
    if (sourceAspect > targetAspect) {
      sw = terrainImage.naturalHeight * targetAspect;
      sx = (terrainImage.naturalWidth - sw) / 2;
    } else {
      sh = terrainImage.naturalWidth / targetAspect;
      sy = (terrainImage.naturalHeight - sh) / 2;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(terrainImage, sx, sy, sw, sh, 0, 0, 1000, 650);
    ctx.fillStyle = "rgba(18, 23, 19, .1)";
    ctx.fillRect(0, 0, 1000, 650);
  } else {
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, 1000, 650);
  }

  ctx.save();
  ctx.globalAlpha = terrainReady ? 0.16 : 0.22;
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1000; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 650); ctx.stroke();
  }
  for (let y = 0; y <= 650; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
  }
  ctx.globalAlpha = terrainReady ? 0.22 : 0.32;
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 1000; x += 200) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 650); ctx.stroke();
  }
  for (let y = 0; y <= 650; y += 200) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
  }
  if (!terrainReady) {
    for (let index = 0; index < 22; index += 1) {
      const x = (index * 173 + frontIndex * 91) % 1000;
      const y = (index * 97 + frontIndex * 143) % 650;
      ctx.fillStyle = index % 2 ? palette.deep : palette.line;
      ctx.beginPath();
      ctx.ellipse(x, y, 34 + (index % 4) * 11, 13 + (index % 3) * 7, (index % 5) * 0.33, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const terrainLight = ctx.createRadialGradient(470, 270, 90, 500, 325, 640);
  terrainLight.addColorStop(0, "rgba(255, 244, 204, .045)");
  terrainLight.addColorStop(.64, "rgba(9, 13, 10, .03)");
  terrainLight.addColorStop(1, "rgba(6, 9, 7, .3)");
  ctx.fillStyle = terrainLight;
  ctx.fillRect(0, 0, 1000, 650);

  front.paths.forEach((path, lane) => {
    drawRoadSurface(ctx, path, palette, front.terrain, frontIndex * 7 + lane * 3);

    const start = path[0];
    ctx.save();
    ctx.translate(Math.max(20, start.x + 40), start.y);
    ctx.fillStyle = "rgba(255,255,255,.65)";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 15, -8); ctx.lineTo(i * 15 + 9, 0); ctx.lineTo(i * 15, 8); ctx.closePath(); ctx.fill();
    }
    ctx.font = "700 10px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`LANE ${lane + 1}`, 0, -16);
    ctx.restore();
  });

  if (terrainOnly) return;

  const { x: hqX, y: hqY } = hqLocation(frontIndex);
  const hqReady = Boolean(hqSprite?.complete && hqSprite.naturalWidth > 0);
  ctx.save();
  ctx.translate(hqX, hqY);
  if (game.hqSelected) {
    ctx.fillStyle = "rgba(231, 190, 86, .2)";
    ctx.beginPath(); ctx.arc(0, 0, 61, 0, Math.PI * 2); ctx.fill();
  }
  drawUnitSeparation(ctx, 55, game.hqSelected ? "#f2ce68" : "#bde6a0", game.hqSelected);
  ctx.fillStyle = "rgba(5, 8, 6, .5)";
  ctx.shadowColor = "rgba(0, 0, 0, .85)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;
  ctx.beginPath();
  ctx.ellipse(2, 13, 51, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (hqReady && hqSprite) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(hqSprite, -HQ_ART.drawSize / 2, -HQ_ART.drawSize / 2, HQ_ART.drawSize, HQ_ART.drawSize);
  } else {
    ctx.fillStyle = "rgba(31, 38, 33, .96)";
    drawRoundedRect(ctx, -39, -34, 78, 68, 9); ctx.fill();
    ctx.strokeStyle = "#d1bd82"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#66725d";
    drawRoundedRect(ctx, -27, -23, 54, 44, 5); ctx.fill();
    ctx.strokeStyle = "rgba(8, 12, 9, .7)"; ctx.lineWidth = 2; ctx.stroke();
  }

  const drawHqAttachment = (family: FamilyKey, x: number, y: number, size: number, rotation = 0) => {
    const sprite = unitSprites[family];
    if (!sprite?.complete || sprite.naturalWidth <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.shadowColor = "rgba(239, 207, 105, .65)";
    ctx.shadowBlur = 7;
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  };
  if (game.hqDefenseLevel >= 1) {
    drawHqAttachment("mg", -34, 22, 32, -.35);
    drawHqAttachment("mg", 34, 22, 32, .35);
  }
  if (game.hqDefenseLevel >= 2) drawHqAttachment("air", 0, -18, 37);
  if (game.hqDefenseLevel >= 3) drawHqAttachment("tank", 0, 31, 35, -Math.PI / 2);

  ctx.fillStyle = "rgba(7, 11, 9, .92)";
  ctx.strokeStyle = "rgba(235, 210, 137, .78)";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, -34, -70, 68, 19, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#f0d58b";
  ctx.font = "900 10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`HQ · DEF ${game.hqDefenseLevel}`, 0, -60.5);
  ctx.fillStyle = "rgba(5, 7, 6, .9)";
  drawRoundedRect(ctx, -32, 59, 64, 9, 4); ctx.fill();
  ctx.fillStyle = game.hq / game.maxHq > .35 ? "#8dc879" : "#e7654a";
  ctx.fillRect(-31, 60, 62 * Math.max(0, game.hq / Math.max(1, game.maxHq)), 7);
  ctx.strokeStyle = "rgba(236, 245, 220, .42)";
  drawRoundedRect(ctx, -32, 59, 64, 9, 4); ctx.stroke();
  ctx.restore();

  for (const smoke of game.smokes) {
    const strength = Math.max(0, Math.min(1, (smoke.expires - game.gameTime) / 8));
    const gradient = ctx.createRadialGradient(smoke.x, smoke.y, 8, smoke.x, smoke.y, 92);
    gradient.addColorStop(0, `rgba(195, 205, 190, ${0.25 + strength * 0.2})`);
    gradient.addColorStop(1, "rgba(195, 205, 190, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(smoke.x, smoke.y, 92, 0, Math.PI * 2); ctx.fill();
  }

  for (const mine of game.mines) {
    ctx.save(); ctx.translate(mine.x, mine.y);
    ctx.fillStyle = "#252b27"; ctx.strokeStyle = "#e2b657"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8); ctx.lineTo(Math.cos(angle) * 13, Math.sin(angle) * 13); ctx.stroke();
    }
    ctx.restore();
  }

  if (game.hqSelected && game.hqDefenseLevel > 0) {
    const hqStats = HQ_DEFENSE_LEVELS[game.hqDefenseLevel];
    drawRangeRings(ctx, hqX, hqY, hqStats.range, 0);
  } else if (game.selectedId !== null) {
    const selected = game.positions.find((position) => position.id === game.selectedId);
    if (selected) {
      const stats = getPositionStats(selected, game.positions, game.gameTime, game.overdriveUntil);
      drawRangeRings(ctx, selected.x, selected.y, stats.range, stats.minRange);
    }
  } else if (game.pointer && game.buildFamily) {
    const family = FAMILIES[game.buildFamily];
    const snap = game.buildFamily === "tank" ? nearestOnPaths(game.pointer, front.paths).point : game.pointer;
    const roadGap = nearestOnPaths(snap, front.paths).distance;
    const edge = game.buildFamily === "airbase" ? 58 : 28;
    const overlap = game.positions.some((position) => distance(position, snap) < placementSeparation(game.buildFamily!, position.family));
    const inside = snap.x >= edge && snap.x <= 1000 - edge && snap.y >= edge && snap.y <= 650 - edge;
    const roadClearance = game.buildFamily === "airbase" ? 72 : 51;
    const valid = inside && !overlap && (game.buildFamily === "tank" ? true : roadGap > roadClearance);
    drawRangeRings(ctx, snap.x, snap.y, family.range, family.minRange, valid);
  }

  if (game.pointer && game.targetSupport) {
    const radius = game.targetSupport === "minefield" ? 24 : game.targetSupport === "smoke" ? 90 : 72;
    drawTargetReticle(
      ctx,
      game.pointer.x,
      game.pointer.y,
      radius,
      game.targetSupport === "smoke" ? "#c9d5c5" : "#ef884f",
    );
  }

  if (game.pointer && game.redeployId !== null) {
    const snap = nearestOnPaths(game.pointer, front.paths).point;
    ctx.save();
    ctx.strokeStyle = "#e4bd5b"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(snap.x, snap.y, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  for (const position of game.positions) {
    const family = FAMILIES[position.family];
    const selected = position.id === game.selectedId;
    const art = UNIT_ART[position.family];
    const sprite = unitSprites[position.family];
    const artReady = Boolean(sprite?.complete && sprite.naturalWidth > 0);
    ctx.save();
    ctx.translate(position.x, position.y);
    if (selected) {
      ctx.fillStyle = "rgba(231, 190, 86, .18)";
      ctx.beginPath(); ctx.arc(0, 0, position.family === "airbase" ? 55 : artReady ? 39 : 31, 0, Math.PI * 2); ctx.fill();
    }
    drawUnitSeparation(
      ctx,
      artReady ? Math.max(31, art.drawSize * .46) : 31,
      selected ? "#f2ce68" : "#bde6a0",
      selected,
    );
    ctx.save();
    if (position.moving) ctx.globalAlpha = .76;
    ctx.rotate(position.angle);
    if (artReady && sprite) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.shadowColor = selected ? "rgba(238, 204, 102, .72)" : "rgba(2, 4, 3, .88)";
      ctx.shadowBlur = selected ? 12 : 8;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(sprite, -art.drawSize / 2, -art.drawSize / 2, art.drawSize, art.drawSize);
    } else {
      ctx.fillStyle = "rgba(15, 19, 17, .72)";
      drawRoundedRect(ctx, -22, -18, 48, 40, position.family === "tank" ? 9 : 13); ctx.fill();
      ctx.fillStyle = family.color;
      drawRoundedRect(ctx, -20, -20, 40, 36, position.family === "tank" ? 7 : 11); ctx.fill();
      ctx.strokeStyle = family.accent; ctx.lineWidth = selected ? 3 : 2; ctx.stroke();
      ctx.fillStyle = family.accent;
      ctx.fillRect(8, -3, position.family === "artillery" ? 27 : 19, position.family === "artillery" ? 6 : 4);
    }
    ctx.restore();
    ctx.fillStyle = "#111512";
    ctx.font = "800 10px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (!artReady) ctx.fillText(family.short, 0, -2);
    const statusY = position.family === "airbase" ? 56 : artReady ? 34 : 23;
    if (position.doctrine) {
      ctx.fillStyle = DOCTRINES[position.doctrine].color;
      ctx.fillRect(-19, statusY - 9, 38, 5);
    }
    ctx.fillStyle = "rgba(5, 7, 6, .9)";
    drawRoundedRect(ctx, -25, statusY, 50, 8, 4); ctx.fill();
    ctx.fillStyle = position.hp / position.maxHp > 0.35 ? "#83ba6c" : "#e7654a";
    ctx.fillRect(-24, statusY + 1, 48 * Math.max(0, position.hp / Math.max(1, position.maxHp)), 6);
    ctx.strokeStyle = "rgba(236, 245, 220, .36)";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, -25, statusY, 50, 8, 4); ctx.stroke();
    drawUpgradeIndicator(ctx, position.rank, position.veteran, position.doctrine, artReady);
    if (game.realTime - position.failedAt < 0.9) {
      const life = 1 - (game.realTime - position.failedAt) / 0.9;
      ctx.strokeStyle = `rgba(255, 151, 70, ${life})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 30 + (1 - life) * 18, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255, 199, 112, ${life})`; ctx.font = "900 11px Arial";
      ctx.fillText("TOO CLOSE", 0, artReady ? -76 : -58);
    }
    if (position.moving) {
      ctx.fillStyle = "#f0cf70"; ctx.font = "800 10px Arial"; ctx.fillText("MOVING", 0, 44);
    }
    ctx.restore();
  }

  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const definition = ENEMIES[enemy.type];
    const art = ENEMY_ART[enemy.type];
    const sprite = enemySprites[enemy.type];
    const artReady = Boolean(sprite?.complete && sprite.naturalWidth > 0);
    const basePath = front.paths[enemy.lane] ?? front.paths[0];
    const path = definition.air ? [basePath[0], basePath[basePath.length - 1]] : basePath;
    const segment = Math.min(enemy.segment, path.length - 2);
    const segmentStart = path[segment];
    const segmentEnd = path[segment + 1];
    const pathAngle = Math.atan2(segmentEnd.y - segmentStart.y, segmentEnd.x - segmentStart.x);
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    const size = enemy.type === "siege" ? 28 : enemy.type === "bulwark" ? 22 : enemy.type === "swarmling" ? 11 : 17;
    drawUnitSeparation(
      ctx,
      artReady ? Math.max(14, art.drawSize * .43) : size + 4,
      definition.air ? "#72e4ee" : "#ff765c",
      false,
      definition.air,
      false,
    );
    if (artReady && sprite) {
      ctx.save();
      ctx.rotate(pathAngle);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.shadowColor = definition.air ? "rgba(99, 220, 232, .72)" : "rgba(78, 8, 5, .9)";
      ctx.shadowBlur = definition.air ? 11 : 8;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(sprite, -art.drawSize / 2, -art.drawSize / 2, art.drawSize, art.drawSize);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(13, 15, 14, .7)";
      ctx.beginPath(); ctx.arc(2, 3, size + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = definition.color;
      if (definition.air) {
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size + 7, size * .7); ctx.lineTo(0, size * .35); ctx.lineTo(-size - 7, size * .7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(232,248,251,.9)"; ctx.lineWidth = 2; ctx.stroke();
      } else {
        drawRoundedRect(ctx, -size, -size * .72, size * 2, size * 1.44, enemy.type === "swarmling" ? 4 : 8); ctx.fill();
        ctx.strokeStyle = "rgba(22, 24, 22, .88)"; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = "#151817"; ctx.font = `900 ${enemy.type === "siege" ? 9 : 8}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(definition.short, 0, 0);
    }
    const badgeOffset = artReady ? art.drawSize * .28 : size - 2;
    ctx.fillStyle = "#1b1d1b"; ctx.beginPath(); ctx.arc(badgeOffset, -badgeOffset, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(238, 116, 86, .78)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#fff2c6"; ctx.font = "800 8px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(enemy.tier), badgeOffset, -badgeOffset);
    const healthWidth = artReady ? Math.max(28, art.drawSize * .68) : size * 2;
    const healthY = artReady ? Math.max(16, art.drawSize * .38) : size + 5;
    ctx.fillStyle = "rgba(5, 7, 6, .92)";
    drawRoundedRect(ctx, -healthWidth / 2 - 1, healthY - 1, healthWidth + 2, 8, 4); ctx.fill();
    ctx.fillStyle = enemy.hp / enemy.maxHp > .3 ? "#dbd47a" : "#e6634d";
    ctx.fillRect(-healthWidth / 2, healthY, healthWidth * Math.max(0, enemy.hp / enemy.maxHp), 6);
    ctx.strokeStyle = "rgba(255, 218, 189, .34)";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, -healthWidth / 2 - 1, healthY - 1, healthWidth + 2, 8, 4); ctx.stroke();
    ctx.restore();
  }

  for (const sortie of game.sorties) {
    if (sortie.complete) continue;
    const art = AIRCRAFT_ART[sortie.kind];
    const sprite = aircraftSprites[sortie.kind];
    const artReady = Boolean(sprite?.complete && sprite.naturalWidth > 0);
    ctx.save();
    ctx.translate(sortie.x, sortie.y);
    ctx.rotate(sortie.angle + Math.PI / 2);
    ctx.globalAlpha = sortie.phase === "returning" ? .82 : 1;
    ctx.strokeStyle = AIRCRAFT_PROFILES[sortie.kind].color;
    ctx.globalAlpha *= .46;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-5, 12); ctx.lineTo(-5, 29);
    ctx.moveTo(5, 12); ctx.lineTo(5, 29);
    ctx.stroke();
    ctx.globalAlpha = sortie.phase === "returning" ? .82 : 1;
    if (artReady && sprite) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.shadowColor = "rgba(0, 0, 0, .76)";
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(sprite, -art.drawSize / 2, -art.drawSize / 2, art.drawSize, art.drawSize);
    } else {
      ctx.fillStyle = AIRCRAFT_PROFILES[sortie.kind].color;
      ctx.beginPath();
      ctx.moveTo(0, -22); ctx.lineTo(16, 15); ctx.lineTo(4, 10); ctx.lineTo(0, 20);
      ctx.lineTo(-4, 10); ctx.lineTo(-16, 15); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  for (const effect of game.effects) {
    const t = Math.max(0, Math.min(1, effect.age / effect.duration));
    const fade = 1 - t;
    ctx.save();
    if (effect.type === "shot" && effect.tx !== undefined && effect.ty !== undefined) {
      ctx.strokeStyle = effect.color ?? `rgba(255, 226, 148, ${fade})`;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(effect.x, effect.y); ctx.lineTo(effect.tx, effect.ty); ctx.stroke();
    } else if (effect.type === "blast" || effect.type === "air-blast") {
      const radius = (effect.radius ?? 52) * (0.35 + t * .8);
      ctx.fillStyle = effect.type === "air-blast" ? `rgba(242, 111, 62, ${fade * .42})` : `rgba(235, 176, 77, ${fade * .28})`;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255, 218, 136, ${fade})`; ctx.lineWidth = 4 * fade + 1; ctx.stroke();
    } else if (effect.type === "hit") {
      ctx.fillStyle = `rgba(255, 235, 181, ${fade})`;
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2 + t;
        ctx.fillRect(effect.x + Math.cos(angle) * t * 18, effect.y + Math.sin(angle) * t * 18, 3, 3);
      }
    } else if (effect.type === "deadzone") {
      ctx.strokeStyle = `rgba(255, 134, 65, ${fade})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, 18 + t * 42, 0, Math.PI * 2); ctx.stroke();
    } else if (effect.type === "air-warning") {
      drawTargetReticle(
        ctx,
        effect.x,
        effect.y,
        effect.radius ?? 72,
        `rgba(255, 120, 63, ${0.5 + Math.sin(effect.age * 18) * .35})`,
      );
    } else if (effect.type === "supply") {
      ctx.fillStyle = `rgba(221, 208, 128, ${fade})`; ctx.font = "800 12px Arial"; ctx.textAlign = "center";
      ctx.fillText("+SUPPLY", effect.x, effect.y - t * 22);
    }
    ctx.restore();
  }

  if (game.paused) {
    ctx.fillStyle = "rgba(9, 12, 10, .52)"; ctx.fillRect(0, 0, 1000, 650);
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.font = "800 30px Arial"; ctx.textAlign = "center"; ctx.fillText("TACTICAL PAUSE", 500, 318);
    ctx.font = "600 14px Arial"; ctx.fillText("Placement and upgrades remain available", 500, 348);
  }
}

function scheduleWave(game: GameState, frontIndex: number) {
  const groups = waveForFront(frontIndex, game.wave);
  const laneCount = FRONTS[frontIndex].paths.length;
  game.spawnQueue = groups.flatMap((group) =>
    Array.from({ length: group.count }, (_, index) => ({
      at: group.delay + index * group.spacing,
      type: group.type,
      tier: group.tier,
      lane: laneCount > 1 ? ((group.lane ?? 0) + index) % laneCount : 0,
    })),
  ).sort((a, b) => a.at - b.at);
  game.waveStartedAt = game.gameTime;
  game.phase = "active";
  game.buildCountdown = 0;
}

function currentSupportCost(game: GameState, key: SupportKey, purchases: Set<string>) {
  const discount = purchases.has("cmd-support") ? 0.9 : 1;
  return Math.round(SUPPORTS[key].cost * Math.pow(1.24, game.supportUses[key]) * discount);
}

function positionName(position: Position) {
  return hardwareFor(position.family, position.rank, position.doctrine);
}

function Battle({
  frontIndex,
  endless,
  save,
  onExit,
  onRetry,
  onFinish,
  onFinishEndless,
  onToggleSound,
  onSpeedChange,
  onVolumeChange,
}: {
  frontIndex: number;
  endless: boolean;
  save: SaveData;
  onExit: () => void;
  onRetry: () => void;
  onFinish: (index: number, stars: number, wave: number, sawTutorial: boolean) => void;
  onFinishEndless: (wave: number) => void;
  onToggleSound: () => void;
  onSpeedChange: (speed: 1 | 2 | 3) => void;
  onVolumeChange: (volume: number) => void;
}) {
  const front = FRONTS[frontIndex];
  const purchases = useMemo(() => new Set(save.purchases), [save.purchases]);
  const [game] = useState<GameState>(() => {
    const supplyRanks = Number(purchases.has("cmd-supply-1")) + Number(purchases.has("cmd-supply-2"));
    const maxHq = front.hq + (purchases.has("cmd-hq") ? 3 : 0);
    return {
      supply: Math.round(front.startSupply * (1 + supplyRanks * 0.08)),
      hq: maxHq,
      maxHq,
      hqDefenseLevel: 0,
      hqDefenseCooldown: 0,
      hqKills: 0,
      hqSelected: false,
      wave: 0,
      phase: "build",
      buildCountdown: 18,
      speed: save.preferredSpeed,
      paused: false,
      gameTime: 0,
      realTime: 0,
      waveStartedAt: 0,
      positions: [],
      enemies: [],
      spawnQueue: [],
      effects: [],
      smokes: [],
      mines: [],
      sorties: [],
      selectedId: null,
      buildFamily: null,
      targetSupport: null,
      redeployId: null,
      pointer: null,
      supportCooldowns: { airstrike: 0, overdrive: 0, repair: 0, smoke: 0, minefield: 0 },
      supportUses: { airstrike: 0, overdrive: 0, repair: 0, smoke: 0, minefield: 0 },
      overdriveUntil: 0,
      incomeCarry: 0,
      ended: false,
      endlessMode: endless,
      discoveredDeadZone: false,
      nextId: 1,
    };
  });
  const waveTarget = game.endlessMode ? Number.POSITIVE_INFINITY : front.waveCount;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastHudRef = useRef<number>(0);
  const audioRef = useRef<BattleAudio | null>(null);
  const rendererRef = useRef<Battlefield3D | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [volume, setVolume] = useState(save.volume);
  const volumeRef = useRef(save.volume);
  const unitSpritesRef = useRef<Partial<Record<FamilyKey, HTMLImageElement>>>({});
  const enemySpritesRef = useRef<Partial<Record<EnemyType, HTMLImageElement>>>({});
  const aircraftSpritesRef = useRef<Partial<Record<SortieKind, HTMLImageElement>>>({});
  const terrainSpritesRef = useRef<Record<string, HTMLImageElement>>({});
  const hqSpriteRef = useRef<HTMLImageElement | null>(null);
  const soundRef = useRef(save.sound);
  const briefingRef = useRef(true);
  const toastTimerRef = useRef<number | null>(null);

  const [briefingOpen, setBriefingOpen] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [outcome, setOutcome] = useState<null | { kind: "victory" | "defeat"; stars: number }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hqSelected, setHqSelected] = useState(false);
  const [buildFamily, setBuildFamily] = useState<FamilyKey | null>(null);
  const [targetSupport, setTargetSupport] = useState<SupportKey | null>(null);
  const [redeployId, setRedeployId] = useState<number | null>(null);
  const [panelVersion, setPanelVersion] = useState(0);
  const [tutorialStep, setTutorialStep] = useState(save.tutorialSeen || frontIndex !== 0 ? -1 : 0);
  const [hud, setHud] = useState<HudState>({
    supply: Math.floor(game.supply),
    hq: game.hq,
    wave: game.wave,
    phase: game.phase,
    countdown: Math.ceil(game.buildCountdown),
    speed: game.speed,
    paused: game.paused,
    enemies: 0,
    cooldowns: { ...game.supportCooldowns },
    uses: { ...game.supportUses },
  });

  useEffect(() => { soundRef.current = save.sound; audioRef.current?.setEnabled(save.sound); }, [save.sound]);
  useEffect(() => { volumeRef.current = volume; audioRef.current?.setVolume(volume); }, [volume]);
  useEffect(() => { briefingRef.current = briefingOpen; }, [briefingOpen]);
  useEffect(() => {
    const sprites: Partial<Record<FamilyKey, HTMLImageElement>> = {};
    for (const familyKey of FAMILY_ORDER) {
      const sprite = new window.Image();
      sprite.decoding = "async";
      sprite.src = UNIT_ART[familyKey].src;
      sprites[familyKey] = sprite;
    }
    unitSpritesRef.current = sprites;
    const enemySprites: Partial<Record<EnemyType, HTMLImageElement>> = {};
    for (const enemyType of Object.keys(ENEMY_ART) as EnemyType[]) {
      const sprite = new window.Image();
      sprite.decoding = "async";
      sprite.src = ENEMY_ART[enemyType].src;
      enemySprites[enemyType] = sprite;
    }
    enemySpritesRef.current = enemySprites;
    const aircraftSprites: Partial<Record<SortieKind, HTMLImageElement>> = {};
    for (const kind of Object.keys(AIRCRAFT_ART) as SortieKind[]) {
      const sprite = new window.Image();
      sprite.decoding = "async";
      sprite.src = AIRCRAFT_ART[kind].src;
      aircraftSprites[kind] = sprite;
    }
    aircraftSpritesRef.current = aircraftSprites;
    const terrainSprites: Record<string, HTMLImageElement> = {};
    for (const [frontId, src] of Object.entries(FRONT_ART)) {
      const image = new window.Image();
      image.decoding = "async";
      image.src = src;
      terrainSprites[frontId] = image;
    }
    terrainSpritesRef.current = terrainSprites;
    const hqSprite = new window.Image();
    hqSprite.decoding = "async";
    hqSprite.src = HQ_ART.src;
    hqSpriteRef.current = hqSprite;
    return () => {
      unitSpritesRef.current = {};
      enemySpritesRef.current = {};
      aircraftSpritesRef.current = {};
      terrainSpritesRef.current = {};
      hqSpriteRef.current = null;
    };
  }, []);

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new BattleAudio();
    audioRef.current.setEnabled(soundRef.current);
    audioRef.current.setVolume(volumeRef.current);
    audioRef.current.unlock();
    return audioRef.current;
  }, []);

  const playSound = useCallback((kind: SoundKey, worldX?: number) => {
    ensureAudio().play(kind, worldX);
  }, [ensureAudio]);

  const syncHud = useCallback(() => {
    const current = game;
    const next: HudState = {
      supply: Math.floor(current.supply),
      hq: current.hq,
      wave: current.wave,
      phase: current.phase,
      countdown: Math.max(0, Math.ceil(current.buildCountdown)),
      speed: current.speed,
      paused: current.paused,
      enemies: current.enemies.filter((enemy) => !enemy.dead).length,
      cooldowns: {
        airstrike: Math.max(0, Math.ceil(current.supportCooldowns.airstrike)),
        overdrive: Math.max(0, Math.ceil(current.supportCooldowns.overdrive)),
        repair: Math.max(0, Math.ceil(current.supportCooldowns.repair)),
        smoke: Math.max(0, Math.ceil(current.supportCooldowns.smoke)),
        minefield: Math.max(0, Math.ceil(current.supportCooldowns.minefield)),
      },
      uses: { ...current.supportUses },
    };
    setHud((previous) => shallowHudEqual(previous, next) ? previous : next);
  }, [game]);

  const launchWave = useCallback(() => {
    const current = game;
    if (current.phase !== "build" || briefingRef.current || current.ended) return;
    ensureAudio();
    scheduleWave(current, frontIndex);
    current.paused = false;
    playSound("confirm");
    setTutorialStep((step) => step === 1 ? 2 : step);
    syncHud();
  }, [ensureAudio, frontIndex, game, playSound, syncHud]);

  useEffect(() => {
    const current = game;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    let renderer: Battlefield3D;
    try {
      renderer = new Battlefield3D(canvas, overlay, frontIndex, hqLocation(frontIndex), (context) => {
        const image = terrainSpritesRef.current[front.id] ?? null;
        drawBoard(context, current, frontIndex, {}, {}, image, null, {}, true);
        return Boolean(image?.complete);
      }, (position) => getPositionStats(position, current.positions, current.gameTime, current.overdriveUntil));
      rendererRef.current = renderer;
    } catch (error) {
      console.error(error);
      queueMicrotask(() => setRenderError("3D graphics could not start. Enable hardware acceleration in your browser, then reload MTD3D."));
      return;
    }

    function rewardKill(enemy: Enemy, source?: Position | "hq") {
      if (enemy.dead) return;
      enemy.dead = true;
      current.supply += enemy.reward;
      if (source === "hq") current.hqKills += 1;
      else if (source) source.kills += 1;
      current.effects.push({ id: current.nextId++, type: "supply", x: enemy.x, y: enemy.y - 10, age: 0, duration: 0.7 });
    }

    function damageEnemy(enemy: Enemy, amount: number, piercing: boolean, source?: Position | "hq", splash = false) {
      if (enemy.dead) return;
      let adjusted = piercing ? amount : Math.max(1, amount - enemy.armor * 3.15);
      if (splash) adjusted *= 1 - (ENEMIES[enemy.type].splashResist ?? 0);
      enemy.hp -= adjusted;
      const patriotHit = source && typeof source !== "string" && source.family === "air";
      current.effects.push({ id: current.nextId++, type: "hit", x: enemy.x, y: enemy.y, age: patriotHit ? -MISSILE_IMPACT_TIME : 0, duration: 0.28, altitude: patriotHit ? 57 : undefined });
      if (enemy.hp <= 0) rewardKill(enemy, source);
    }

    function completeBattle(victory: boolean) {
      if (current.ended) return;
      current.ended = true;
      current.phase = victory ? "victory" : "defeat";
      current.paused = true;
      const lost = current.maxHq - current.hq;
      const stars = victory ? (lost === 0 ? 3 : lost <= 5 ? 2 : 1) : 0;
      if (current.endlessMode) onFinishEndless(current.wave);
      else onFinish(frontIndex, stars, current.wave, current.discoveredDeadZone || frontIndex === 0);
      setOutcome({ kind: victory ? "victory" : "defeat", stars });
      playSound(victory ? "confirm" : "alarm");
      syncHud();
    }

    function tick(timestamp: number) {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const dtReal = Math.min(0.05, Math.max(0, (timestamp - lastFrameRef.current) / 1000));
      lastFrameRef.current = timestamp;
      current.realTime += dtReal;

      const airTriggers: Effect[] = [];
      current.effects.forEach((effect) => {
        effect.age += dtReal;
        if (effect.type === "air-warning" && !effect.triggered && effect.age >= 0.68) {
          effect.triggered = true;
          airTriggers.push(effect);
        }
      });
      current.effects = current.effects.filter((effect) => effect.age <= effect.duration);

      if (!current.paused && !briefingRef.current && !current.ended) {
        const dt = dtReal * current.speed;
        current.gameTime += dt;

        (Object.keys(current.supportCooldowns) as SupportKey[]).forEach((key) => {
          current.supportCooldowns[key] = Math.max(0, current.supportCooldowns[key] - dt);
        });
        current.smokes = current.smokes.filter((zone) => zone.expires > current.gameTime);

        for (const sortie of current.sorties) {
          if (sortie.complete) continue;
          const source = current.positions.find((position) => position.id === sortie.sourceId && position.hp > 0);
          if (sortie.phase === "outbound") {
            const target = current.enemies.find((enemy) => enemy.id === sortie.targetId && !enemy.dead);
            if (!target) {
              sortie.phase = "returning";
            } else if (advanceSortie(sortie, target, sortie.speed * dt)) {
              const targetIsAir = ENEMIES[target.type].air === true;
              const impact = { x: target.x, y: target.y };
              damageEnemy(target, sortie.damage, sortie.piercing, source);
              current.effects.push({
                id: current.nextId++,
                type: targetIsAir ? "air-blast" : "blast",
                x: impact.x,
                y: impact.y,
                age: 0,
                duration: .5,
                radius: targetIsAir ? 28 : sortie.splash,
              });
              if (!targetIsAir && sortie.splash > 0) {
                current.enemies.forEach((nearby) => {
                  if (nearby.id !== target.id && !nearby.dead && ENEMIES[nearby.type].air !== true && distance(nearby, impact) < sortie.splash) {
                    damageEnemy(nearby, sortie.damage * .52, sortie.piercing, source, true);
                  }
                });
              }
              sortie.phase = "returning";
              playSound(targetIsAir ? "missile" : "blast", impact.x);
            }
          }
          if (sortie.phase === "returning") {
            if (!source || advanceSortie(sortie, source, sortie.speed * 1.08 * dt)) sortie.complete = true;
          }
        }
        current.sorties = current.sorties.filter((sortie) => !sortie.complete);

        for (const position of current.positions) {
          if (!position.moving) continue;
          position.moving.elapsed += dt;
          const t = Math.min(1, position.moving.elapsed / position.moving.duration);
          const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          position.x = position.moving.from.x + (position.moving.to.x - position.moving.from.x) * eased;
          position.y = position.moving.from.y + (position.moving.to.y - position.moving.from.y) * eased;
          if (t >= 1) position.moving = undefined;
        }

        let logisticsIncome = 0;
        current.positions.forEach((position) => {
          if (!position.moving) logisticsIncome += getPositionStats(position, current.positions, current.gameTime, current.overdriveUntil).income;
        });
        current.incomeCarry += logisticsIncome * dt;
        if (current.incomeCarry >= 1) {
          const whole = Math.floor(current.incomeCarry);
          current.supply += whole;
          current.incomeCarry -= whole;
        }

        if (current.phase === "build") {
          current.buildCountdown -= dt;
          if (current.buildCountdown <= 0) scheduleWave(current, frontIndex);
        }

        if (current.phase === "active") {
          const elapsed = current.gameTime - current.waveStartedAt;
          while (current.spawnQueue.length && current.spawnQueue[0].at <= elapsed) {
            const spawn = current.spawnQueue.shift()!;
            const definition = ENEMIES[spawn.type];
            const stats = enemyStats(spawn.type, spawn.tier, front.difficulty);
            const basePath = front.paths[spawn.lane] ?? front.paths[0];
            const path = definition.air ? [basePath[0], basePath[basePath.length - 1]] : basePath;
            const start = path[0];
            current.enemies.push({
              id: current.nextId++, type: spawn.type, tier: spawn.tier, lane: spawn.lane,
              x: start.x, y: start.y, segment: 0, segmentT: 0, travelled: 0,
              totalDistance: pathLength(path), hp: stats.hp, maxHp: stats.hp, armor: stats.armor,
              reward: stats.reward, speed: stats.speed, attackCooldown: 0, slowUntil: 0,
              slowFactor: 1, dead: false,
            });
          }

          for (const enemy of current.enemies) {
            if (enemy.dead) continue;
            const definition = ENEMIES[enemy.type];
            enemy.attackCooldown -= dt;
            const basePath = front.paths[enemy.lane] ?? front.paths[0];
            const path = definition.air ? [basePath[0], basePath[basePath.length - 1]] : basePath;
            let stopped = false;

            if (!definition.air) {
              const blockers = current.positions
                .filter((position) => position.family === "tank" && !position.moving && position.hp > 0)
                .map((position) => ({ position, gap: distance(position, enemy) }))
                .filter((entry) => entry.gap < 32)
                .sort((a, b) => a.gap - b.gap);
              if (blockers.length) {
                stopped = true;
                const blocker = blockers[0].position;
                if (enemy.attackCooldown <= 0) {
                  blocker.hp -= definition.attack * (1 + (enemy.tier - 1) * 0.15) * ENEMY_COMBAT_DAMAGE_SCALE;
                  enemy.attackCooldown = enemy.type === "swarmling" ? 0.8 : 1.25;
                  current.effects.push({ id: current.nextId++, type: "hit", x: blocker.x, y: blocker.y, age: 0, duration: 0.25 });
                }
              }
            }

            if (!stopped && definition.ranged) {
              const target = current.positions
                .filter((position) => !position.moving && position.hp > 0)
                .map((position) => ({ position, gap: distance(position, enemy) }))
                .filter((entry) => entry.gap < 168)
                .sort((a, b) => a.gap - b.gap)[0]?.position;
              if (target) {
                stopped = true;
                if (enemy.attackCooldown <= 0) {
                  target.hp -= definition.attack * (1 + (enemy.tier - 1) * .12) * ENEMY_COMBAT_DAMAGE_SCALE;
                  enemy.attackCooldown = 1.55;
                  current.effects.push({ id: current.nextId++, type: "shot", x: enemy.x, y: enemy.y, tx: target.x, ty: target.y, age: 0, duration: 0.18, color: "rgba(234,138,103,.9)" });
                }
              }
            }

            if (!stopped) {
              const inSmoke = current.smokes.some((zone) => distance(zone, enemy) < 90);
              const slow = inSmoke ? 0.34 : current.gameTime < enemy.slowUntil ? enemy.slowFactor : 1;
              const reachedHq = moveAlongPath(enemy, path, enemy.speed * slow * dt);
              if (reachedHq) {
                current.hq = Math.max(0, current.hq - definition.hqCost);
                enemy.dead = true;
                current.effects.push({ id: current.nextId++, type: "blast", x: enemy.x, y: enemy.y, age: 0, duration: 0.55, radius: 34 });
                playSound("alarm", enemy.x);
              }
            }

            if (!enemy.dead && !definition.air) {
              const mineIndex = current.mines.findIndex((mine) => distance(mine, enemy) < 23);
              if (mineIndex >= 0) {
                const mine = current.mines[mineIndex];
                current.mines.splice(mineIndex, 1);
                damageEnemy(enemy, 520, true);
                current.effects.push({ id: current.nextId++, type: "blast", x: mine.x, y: mine.y, age: 0, duration: 0.65, radius: 58 });
                playSound("blast", mine.x);
              }
            }
          }

          for (const strike of airTriggers) {
            current.effects.push({ id: current.nextId++, type: "air-blast", x: strike.x, y: strike.y, age: 0, duration: 0.75, radius: 94 });
            current.enemies.forEach((enemy) => {
              if (!enemy.dead && distance(enemy, strike) <= 94) damageEnemy(enemy, 390, false);
            });
            playSound("blast", strike.x);
          }

          const hqDefense = HQ_DEFENSE_LEVELS[current.hqDefenseLevel];
          current.hqDefenseCooldown = Math.max(0, current.hqDefenseCooldown - dt);
          if (current.hqDefenseLevel > 0 && current.hqDefenseCooldown <= 0) {
            const hqPoint = hqLocation(frontIndex);
            const hqTarget = current.enemies
              .filter((enemy) => !enemy.dead
                && (hqDefense.allTargets || ENEMIES[enemy.type].air !== true)
                && distance(hqPoint, enemy) <= hqDefense.range)
              .sort((a, b) => {
                const airPriority = hqDefense.allTargets
                  ? Number(ENEMIES[b.type].air === true) - Number(ENEMIES[a.type].air === true)
                  : 0;
                return airPriority || (b.travelled / b.totalDistance) - (a.travelled / a.totalDistance);
              })[0];
            if (hqTarget) {
              const impact = { x: hqTarget.x, y: hqTarget.y };
              current.effects.push({
                id: current.nextId++,
                type: "shot",
                x: hqPoint.x,
                y: hqPoint.y,
                tx: impact.x,
                ty: impact.y,
                age: 0,
                duration: .18,
                color: current.hqDefenseLevel >= 2 ? "rgba(125, 217, 229, .96)" : "rgba(240, 211, 135, .96)",
              });
              damageEnemy(hqTarget, hqDefense.damage, current.hqDefenseLevel >= 2, "hq");
              if (hqDefense.splash > 0) {
                current.effects.push({ id: current.nextId++, type: "blast", x: impact.x, y: impact.y, age: 0, duration: .42, radius: hqDefense.splash });
                current.enemies.forEach((nearby) => {
                  if (nearby.id !== hqTarget.id && !nearby.dead && distance(nearby, impact) < hqDefense.splash) {
                    damageEnemy(nearby, hqDefense.damage * .48, true, "hq", true);
                  }
                });
              }
              current.hqDefenseCooldown = hqDefense.cooldown / (current.gameTime < current.overdriveUntil ? 2 : 1);
              if (current.hqDefenseLevel > 1 || Math.random() < .2) {
                playSound(current.hqDefenseLevel === 1 ? "rifle" : current.hqDefenseLevel === 2 ? "missile" : "cannon", hqPoint.x);
              }
            }
          }

          const destroyedIds = new Set(current.positions.filter((position) => position.hp <= 0).map((position) => position.id));
          if (destroyedIds.size) {
            current.positions = current.positions.filter((position) => !destroyedIds.has(position.id));
            if (current.selectedId !== null && destroyedIds.has(current.selectedId)) {
              current.selectedId = null;
              setSelectedId(null);
              announce("Position lost under enemy fire.");
            }
          }

          for (const position of current.positions) {
            if (position.moving || position.hp <= 0) continue;
            const family = FAMILIES[position.family];
            const stats = getPositionStats(position, current.positions, current.gameTime, current.overdriveUntil);
            position.cooldown -= dt;
            if (position.family === "airbase") {
              const target = current.enemies
                .filter((enemy) => !enemy.dead && distance(position, enemy) <= stats.range)
                .sort((a, b) => {
                  const airPriority = Number(ENEMIES[b.type].air === true) - Number(ENEMIES[a.type].air === true);
                  return airPriority || (b.travelled / b.totalDistance) - (a.travelled / a.totalDistance);
                })[0];
              if (target && position.cooldown <= 0) {
                const targetIsAir = ENEMIES[target.type].air === true;
                const kind = chooseSortieKind(target, current.enemies, current.nextId);
                const aircraft = AIRCRAFT_PROFILES[kind];
                current.sorties.push({
                  id: current.nextId++,
                  sourceId: position.id,
                  targetId: target.id,
                  kind,
                  phase: "outbound",
                  x: position.x,
                  y: position.y,
                  angle: Math.atan2(target.y - position.y, target.x - position.x),
                  damage: stats.damage * aircraft.damage,
                  splash: targetIsAir ? 0 : Math.max(18, stats.splash * aircraft.splash),
                  speed: aircraft.speed,
                  piercing: aircraft.piercing,
                  complete: false,
                });
                position.cooldown = stats.cooldown;
                playSound(aircraft.launchSound, position.x);
              }
              continue;
            }
            const targetable = current.enemies.filter((enemy) => {
              if (enemy.dead) return false;
              const air = ENEMIES[enemy.type].air === true;
              return family.allTargets ? true : family.airOnly ? air : !air;
            });
            const inRange = targetable
              .filter((enemy) => {
                const gap = distance(position, enemy);
                return gap <= stats.range && gap >= stats.minRange;
              })
              .sort((a, b) => (b.travelled / b.totalDistance) - (a.travelled / a.totalDistance));
            const tooClose = stats.minRange > 0
              ? targetable.filter((enemy) => distance(position, enemy) < stats.minRange).sort((a, b) => distance(position, a) - distance(position, b))
              : [];

            const target = inRange[0];
            if (target && position.cooldown <= 0) {
              position.angle = Math.atan2(target.y - position.y, target.x - position.x);
              position.cooldown = stats.cooldown;
              current.effects.push({ id: current.nextId++, type: "shot", x: position.x, y: position.y, tx: target.x, ty: target.y, age: 0, duration: position.family === "air" ? MISSILE_DURATION : 0.16, weapon: position.family, sourceId: position.id, color: position.family === "air" ? "rgba(126,208,223,.95)" : undefined });
              damageEnemy(target, stats.damage, family.pierce === true, position);
              if (stats.splash > 0) {
                current.effects.push({ id: current.nextId++, type: "blast", x: target.x, y: target.y, age: position.family === "air" ? -MISSILE_IMPACT_TIME : 0, duration: 0.46, radius: stats.splash, altitude: position.family === "air" ? 57 : undefined });
                current.enemies.forEach((nearby) => {
                  if (nearby.id !== target.id && !nearby.dead && distance(nearby, target) < stats.splash) {
                    const nearbyAir = ENEMIES[nearby.type].air === true;
                    if ((family.airOnly && nearbyAir) || (!family.airOnly && !nearbyAir)) damageEnemy(nearby, stats.damage * .56, family.pierce === true, position, true);
                  }
                });
              }
              if (stats.slow > 0 && !target.dead) {
                target.slowUntil = current.gameTime + 1.7;
                target.slowFactor = Math.max(.45, 1 - stats.slow);
              }
              if (position.family !== "mg" || Math.random() < .13) {
                playSound(position.family === "mg" ? "rifle" : position.family === "artillery" ? "artillery" : position.family === "air" ? "missile" : "cannon", position.x);
              }
            } else if (!target && tooClose.length && position.cooldown <= 0) {
              const close = tooClose[0];
              position.angle = Math.atan2(close.y - position.y, close.x - position.x);
              position.cooldown = Math.min(0.85, stats.cooldown);
              position.failedAt = current.realTime;
              current.effects.push({ id: current.nextId++, type: "deadzone", x: close.x, y: close.y, age: 0, duration: 0.72 });
              playSound("failed", position.x);
              if (!current.discoveredDeadZone) {
                current.discoveredDeadZone = true;
                setTutorialStep(3);
                announce("Dead zone: this target is inside the gun's minimum range.");
              }
            }
          }

          current.enemies = current.enemies.filter((enemy) => !enemy.dead);
          if (current.hq <= 0) completeBattle(false);
          if (!current.ended && current.spawnQueue.length === 0 && current.enemies.length === 0) {
            const completedWave = current.wave + 1;
            current.supply += Math.round(55 + 34 * Math.sqrt(completedWave));
            current.wave = completedWave;
            if (!current.endlessMode && current.wave >= front.waveCount) {
              completeBattle(true);
            } else {
              current.phase = "build";
              current.buildCountdown = 6;
              current.positions.forEach((position) => {
                position.hp = Math.min(position.maxHp, position.hp + position.maxHp * .2);
              });
              announce(`Wave ${completedWave} held. Supply delivered.`);
              playSound("confirm");
            }
          }
        }
      }

      renderer.render(current);
      if (timestamp - lastHudRef.current > 100) {
        lastHudRef.current = timestamp;
        syncHud();
      }
      frameRef.current = window.requestAnimationFrame(tick);
    }

      renderer.render(current);
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      renderer.dispose();
      rendererRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [announce, front, frontIndex, game, onFinish, onFinishEndless, playSound, syncHud]);

  function clearModes() {
    game.buildFamily = null;
    game.targetSupport = null;
    game.redeployId = null;
    setBuildFamily(null);
    setTargetSupport(null);
    setRedeployId(null);
  }

  function selectPosition(id: number | null) {
    game.selectedId = id;
    game.hqSelected = false;
    setSelectedId(id);
    setHqSelected(false);
    if (id !== null) {
      game.buildFamily = null;
      game.targetSupport = null;
      setBuildFamily(null);
      setTargetSupport(null);
    }
    setPanelVersion((value) => value + 1);
  }

  function toggleBuild(family: FamilyKey) {
    ensureAudio();
    const next = game.buildFamily === family ? null : family;
    game.buildFamily = next;
    game.targetSupport = null;
    game.redeployId = null;
    game.selectedId = null;
    game.hqSelected = false;
    setBuildFamily(next);
    setTargetSupport(null);
    setRedeployId(null);
    setSelectedId(null);
    setHqSelected(false);
  }

  function activateImmediateSupport(key: SupportKey) {
    const cost = currentSupportCost(game, key, purchases);
    if (game.supportCooldowns[key] > 0 || game.supply < cost) return;
    game.supply -= cost;
    game.supportUses[key] += 1;
    game.supportCooldowns[key] = SUPPORTS[key].cooldown;
    if (key === "overdrive") {
      game.overdriveUntil = game.gameTime + 10;
      announce("Overdrive active: all positions firing at double rate.");
      playSound("confirm");
    }
    if (key === "repair") {
      game.hq = Math.min(game.maxHq, game.hq + 4);
      announce("HQ repaired by 4.");
      playSound("confirm");
    }
    syncHud();
  }

  function chooseSupport(key: SupportKey) {
    ensureAudio();
    const support = SUPPORTS[key];
    const cost = currentSupportCost(game, key, purchases);
    if (game.supportCooldowns[key] > 0) {
      announce(`${support.name} is cooling down.`);
      return;
    }
    if (game.supply < cost) {
      announce(`Need ${cost} supply for ${support.name}.`);
      return;
    }
    if (!support.targeted) {
      activateImmediateSupport(key);
      return;
    }
    const next = game.targetSupport === key ? null : key;
    game.targetSupport = next;
    game.buildFamily = null;
    game.redeployId = null;
    game.selectedId = null;
    game.hqSelected = false;
    setTargetSupport(next);
    setBuildFamily(null);
    setRedeployId(null);
    setSelectedId(null);
    setHqSelected(false);
  }

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    return rendererRef.current?.pointAt(event.clientX, event.clientY, !game.buildFamily && !game.targetSupport && game.redeployId === null) ?? null;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    game.pointer = canvasPoint(event);
  }

  function handlePointerLeave() {
    game.pointer = null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    ensureAudio();
    const point = canvasPoint(event);
    if (!point) return;
    game.pointer = point;

    if (game.targetSupport) {
      const key = game.targetSupport;
      const cost = currentSupportCost(game, key, purchases);
      if (game.supportCooldowns[key] > 0 || game.supply < cost) return;
      game.supply -= cost;
      game.supportUses[key] += 1;
      game.supportCooldowns[key] = SUPPORTS[key].cooldown;
      if (key === "airstrike") {
        game.effects.push({ id: game.nextId++, type: "air-warning", x: point.x, y: point.y, age: 0, duration: .78, radius: 94 });
        announce("Airstrike inbound.");
      }
      if (key === "smoke") {
        game.smokes.push({ id: game.nextId++, x: point.x, y: point.y, expires: game.gameTime + 11 });
        announce("Smoke screen deployed.");
      }
      if (key === "minefield") {
        const snap = nearestOnPaths(point, front.paths).point;
        game.mines.push({ id: game.nextId++, x: snap.x, y: snap.y });
        announce("Mine armed on the road.");
      }
      game.targetSupport = null;
      setTargetSupport(null);
      playSound(key === "airstrike" ? "jet" : "confirm", point.x);
      syncHud();
      return;
    }

    if (game.redeployId !== null) {
      const position = game.positions.find((entry) => entry.id === game.redeployId);
      if (!position) { clearModes(); return; }
      const destination = nearestOnPaths(point, front.paths).point;
      if (game.positions.some((entry) => entry.id !== position.id && distance(entry, destination) < 46)) {
        announce("That destination is occupied.");
        return;
      }
      const doctrineRank = position.doctrine === "mobility" ? Math.max(0, position.rank - 1) : 0;
      const moveSpeed = doctrineRank > 0 ? 150 : 76;
      position.moving = {
        from: { x: position.x, y: position.y },
        to: destination,
        elapsed: 0,
        duration: Math.max(.55, distance(position, destination) / moveSpeed),
      };
      game.redeployId = null;
      setRedeployId(null);
      announce("Tank redeploying. It cannot fight or block while moving.");
      setPanelVersion((value) => value + 1);
      return;
    }

    if (game.buildFamily) {
      const familyKey = game.buildFamily;
      const family = FAMILIES[familyKey];
      const owned = game.positions.filter((position) => position.family === familyKey).length;
      const cost = placementCost(familyKey, owned);
      const nearestRoad = nearestOnPaths(point, front.paths);
      const location = familyKey === "tank" ? nearestRoad.point : point;
      const roadClearance = familyKey === "airbase" ? 72 : 51;
      if (familyKey !== "tank" && nearestRoad.distance <= roadClearance) {
        announce("Road must stay clear. Place this position beside it.");
        playSound("failed");
        return;
      }
      const edge = familyKey === "airbase" ? 58 : 28;
      if (location.x < edge || location.x > 1000 - edge || location.y < edge || location.y > 650 - edge) {
        announce("Choose a location inside the defensive perimeter.");
        return;
      }
      if (game.positions.some((position) => distance(position, location) < placementSeparation(familyKey, position.family))) {
        announce("Too close to another position.");
        return;
      }
      if (game.supply < cost) {
        announce(`Need ${cost} supply for ${family.name}.`);
        return;
      }
      const id = game.nextId++;
      const position: Position = {
        id, family: familyKey, x: location.x, y: location.y, rank: 0, veteran: 0,
        cooldown: 0, angle: 0, hp: family.maxHp, maxHp: family.maxHp, kills: 0,
        failedAt: -100,
      };
      game.positions.push(position);
      game.supply -= cost;
      game.buildFamily = null;
      setBuildFamily(null);
      selectPosition(id);
      setTutorialStep((step) => step === 0 ? 1 : step);
      playSound("confirm");
      syncHud();
      return;
    }

    const hqPoint = hqLocation(frontIndex);
    if (distance(point, hqPoint) <= 62) {
      game.hqSelected = true;
      game.selectedId = null;
      setHqSelected(true);
      setSelectedId(null);
      clearModes();
      setPanelVersion((value) => value + 1);
      return;
    }

    const hit = game.positions
      .map((position) => ({ position, gap: distance(position, point) }))
      .filter((entry) => entry.gap <= (entry.position.family === "airbase" ? 54 : 34))
      .sort((a, b) => a.gap - b.gap)[0]?.position;
    selectPosition(hit?.id ?? null);
  }

  function upgradeSelected(choice?: Doctrine) {
    const position = game.positions.find((entry) => entry.id === selectedId);
    if (!position || position.moving) return;
    const promotionDiscount = purchases.has("cmd-veteran") ? .88 : 1;
    const isVeteran = position.rank >= 4;
    const cost = isVeteran ? veteranCost(position.veteran, promotionDiscount) : upgradeCost(position.rank);
    if (game.supply < cost) {
      announce(`Need ${cost} supply for this upgrade.`);
      return;
    }
    if (position.rank === 1 && !choice) return;
    if (position.rank === 3 && position.doctrine && !purchases.has(`tech-${position.doctrine}`)) {
      announce(`Modern ${DOCTRINES[position.doctrine].name} is locked in the Armoury.`);
      return;
    }
    const oldMax = getPositionStats(position, game.positions, game.gameTime, game.overdriveUntil).maxHp;
    game.supply -= cost;
    if (isVeteran) {
      position.veteran += 1;
    } else {
      if (position.rank === 1) position.doctrine = choice;
      position.rank += 1;
    }
    const nextMax = getPositionStats(position, game.positions, game.gameTime, game.overdriveUntil).maxHp;
    position.maxHp = nextMax;
    position.hp = Math.min(nextMax, position.hp + Math.max(0, nextMax - oldMax));
    setPanelVersion((value) => value + 1);
    playSound("upgrade");
    syncHud();
  }

  function upgradeHq() {
    const next = HQ_DEFENSE_LEVELS[game.hqDefenseLevel + 1];
    if (!next) {
      announce("HQ defenses are already at maximum strength.");
      return;
    }
    if (game.supply < next.upgradeCost) {
      announce(`Need ${next.upgradeCost} supply for ${next.name}.`);
      return;
    }
    game.supply -= next.upgradeCost;
    game.hqDefenseLevel += 1;
    game.maxHq += next.integrityBoost;
    game.hq += next.integrityBoost;
    game.hqDefenseCooldown = 0;
    setPanelVersion((value) => value + 1);
    announce(`${next.name} is operational.`);
    playSound("upgrade");
    syncHud();
  }

  function continueEndless() {
    if (outcome?.kind !== "victory") return;
    game.endlessMode = true;
    game.ended = false;
    game.phase = "build";
    game.paused = false;
    game.buildCountdown = 6;
    game.positions.forEach((position) => {
      position.hp = Math.min(position.maxHp, position.hp + position.maxHp * .25);
    });
    setOutcome(null);
    setPanelVersion((value) => value + 1);
    announce("Infinite mode enabled. Enemy strength will keep escalating.");
    playSound("upgrade");
    syncHud();
  }

  function beginRedeploy() {
    const position = game.positions.find((entry) => entry.id === game.selectedId);
    if (!position || position.family !== "tank" || position.moving) return;
    game.redeployId = position.id;
    game.buildFamily = null;
    game.targetSupport = null;
    game.hqSelected = false;
    setRedeployId(position.id);
    setBuildFamily(null);
    setTargetSupport(null);
    setHqSelected(false);
  }

  function togglePause() {
    game.paused = !game.paused;
    syncHud();
  }

  function setSpeed(speed: 1 | 2 | 3) {
    game.speed = speed;
    game.paused = false;
    onSpeedChange(speed);
    syncHud();
  }

  const selectedPosition = useMemo(
    () => game.positions.find((position) => position.id === selectedId) ?? null,
    // panelVersion is a deliberate mutation revision for the canvas-owned model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, panelVersion, selectedId, hud.supply],
  );
  const selectedStats = selectedPosition
    ? getPositionStats(selectedPosition, game.positions, game.gameTime, game.overdriveUntil)
    : null;
  const selectedHqDefense = HQ_DEFENSE_LEVELS[game.hqDefenseLevel];
  const nextHqDefense = HQ_DEFENSE_LEVELS[game.hqDefenseLevel + 1] ?? null;
  const availableSupports: SupportKey[] = [
    "airstrike", "overdrive", "repair",
    ...(purchases.has("arsenal-smoke") ? ["smoke" as SupportKey] : []),
    ...(purchases.has("arsenal-mine") ? ["minefield" as SupportKey] : []),
  ];
  const nextEnemies = hud.wave < waveTarget ? nextWaveNames(frontIndex, hud.wave) : [];
  const modeText = targetSupport
    ? `Tap the battlefield to place ${SUPPORTS[targetSupport].name}`
    : redeployId !== null
      ? "Tap a road to set the tank's destination"
      : buildFamily
        ? buildFamily === "tank" ? "Tap a road to deploy the tank" : `Tap clear ground to deploy ${FAMILIES[buildFamily].name}`
        : null;

  return (
    <main className="battle-shell">
      <header className="battle-header">
        <button className="battle-map-button" onClick={onExit} aria-label="Return to campaign map"><Map /><span>Map</span></button>
        <div className="battle-front-title">
          <span>{game.endlessMode ? "Endless war game" : `Front ${String(frontIndex + 1).padStart(2, "0")} · ${front.year}`}</span>
          <strong>{game.endlessMode ? `${front.place} proving ground` : front.place}</strong>
        </div>
        <div className="battle-readouts">
          <div className="readout supply-readout"><span>Supply</span><strong>{hud.supply}</strong></div>
          <div className="readout hq-readout"><span>HQ</span><strong>{hud.hq}/{game.maxHq}</strong></div>
          <div className="readout wave-readout"><span>Wave</span><strong>{hud.wave + 1}/{game.endlessMode ? "∞" : front.waveCount}</strong></div>
        </div>
        <div className="battle-controls">
          <div className="speed-control" aria-label="Game speed">
            {([1, 2, 3] as const).map((speed) => (
              <button key={speed} className={hud.speed === speed && !hud.paused ? "is-active" : ""} onClick={() => setSpeed(speed)}>{speed}×</button>
            ))}
          </div>
          <button className="icon-button compact" onClick={togglePause} aria-label={hud.paused ? "Resume" : "Pause"}>{hud.paused ? <Play /> : <Pause />}</button>
          <button className="icon-button compact" onClick={onToggleSound} aria-label={save.sound ? "Mute sound" : "Turn sound on"}>{save.sound ? <Volume2 /> : <VolumeX />}</button>
          <label className="volume-control" title="Battlefield volume"><span>Volume</span><input aria-label="Battlefield volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); onVolumeChange(value); ensureAudio().setVolume(value); }} /></label>
          <button className="icon-button compact" onClick={() => setManualOpen(true)} aria-label="Open field manual"><Info /></button>
        </div>
      </header>

      <section className="battle-stage">
        <div className="threat-ribbon"><Target /><span><strong>Threat:</strong> {front.threat}</span></div>
        {hud.phase === "build" && !briefingOpen && (
          <div className="wave-preview">
            <div><span>Incoming</span><strong>{nextEnemies.join(" · ")}</strong></div>
            <button onClick={launchWave}><Play /> Deploy wave <b>{hud.countdown}</b></button>
          </div>
        )}
        {modeText && (
          <div className="placement-mode"><Crosshair /><span>{modeText}</span><button onClick={clearModes}><X /><span>Cancel</span></button></div>
        )}
        {tutorialStep >= 0 && tutorialStep < 3 && !briefingOpen && (
          <div className="tutorial-callout">
            <span>{tutorialStep + 1}</span>
            {tutorialStep === 0 && "Choose MG Nest below, then tap clear ground beside the road."}
            {tutorialStep === 1 && "Your position is ready. Start the wave when your line is set."}
            {tutorialStep === 2 && "Select Artillery and watch both rings—the orange center is its dead zone."}
          </div>
        )}
        {toast && <div className="battle-toast" role="status">{toast}</div>}
        <div className="battle-viewport">
        <canvas
          ref={canvasRef}
          className="battle-canvas"
          aria-label={`Battlefield at ${front.place}. Tap to place and select defensive positions.`}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
        />
        <canvas ref={overlayRef} className="tactical-overlay" aria-hidden="true" />
        </div>
        <div className="camera-controls" aria-label="3D camera controls">
          <span>3D VIEW</span>
          <button onClick={() => rendererRef.current?.control("left")} aria-label="Rotate camera left">↶</button>
          <button onClick={() => rendererRef.current?.control("right")} aria-label="Rotate camera right">↷</button>
          <button onClick={() => rendererRef.current?.control("out")} aria-label="Zoom out">−</button>
          <button onClick={() => rendererRef.current?.control("in")} aria-label="Zoom in">+</button>
          <button onClick={() => rendererRef.current?.control("tilt")}>Tilt</button>
          <button onClick={() => rendererRef.current?.control("reset")}>Reset view</button>
        </div>
        {renderError && <div className="graphics-error" role="alert"><strong>Graphics unavailable</strong><p>{renderError}</p><button onClick={onExit}>Return to campaign</button></div>}
        <div className="board-key" aria-hidden="true"><i className="key-max" /> Max range <i className="key-dead" /> Dead zone</div>
      </section>

      <section className={`battle-command ${selectedPosition || hqSelected ? "has-selection" : ""}`}>
        <div className="command-bars">
          <div className="command-group build-group">
            <div className="command-label"><span>Build positions</span><small>Cost rises after the second of each type</small></div>
            <div className="command-scroll">
              {FAMILY_ORDER.map((familyKey) => {
                const family = FAMILIES[familyKey];
                const owned = game.positions.filter((position) => position.family === familyKey).length;
                const cost = placementCost(familyKey, owned);
                return (
                  <button
                    key={familyKey}
                    className={`unit-button unit-${familyKey} ${buildFamily === familyKey ? "is-active" : ""}`}
                    onClick={() => toggleBuild(familyKey)}
                    disabled={hud.supply < cost || hud.phase === "victory" || hud.phase === "defeat"}
                    title={family.signature}
                  >
                    <span className="unit-glyph is-unit-art">
                      <img src={UNIT_ART[familyKey].src} alt="" width={64} height={64} draggable={false} />
                    </span>
                    <span><strong>{family.name}</strong><small>{cost} supply</small></span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="command-group support-group">
            <div className="command-label"><span>Support powers</span><small>Repeat uses cost more</small></div>
            <div className="command-scroll support-scroll">
              {availableSupports.map((key) => {
                const support = SUPPORTS[key];
                const cost = currentSupportCost(game, key, purchases);
                const cooldown = hud.cooldowns[key];
                const disabled = cooldown > 0 || hud.supply < cost || (key === "repair" && hud.hq >= game.maxHq);
                return (
                  <button
                    key={key}
                    className={`support-button ${targetSupport === key ? "is-active" : ""}`}
                    onClick={() => chooseSupport(key)}
                    disabled={disabled}
                    title={support.description}
                  >
                    <span>{key === "airstrike" ? <Bomb /> : key === "overdrive" ? <FastForward /> : key === "repair" ? <Shield /> : key === "smoke" ? <Zap /> : <Target />}</span>
                    <strong>{support.name}</strong>
                    <small>{cooldown > 0 ? `${cooldown}s` : `${cost} supply`}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {hqSelected && (
          <aside className="position-panel hq-panel" key={`hq-${game.hqDefenseLevel}-${panelVersion}`}>
            <button className="panel-close" onClick={() => { game.hqSelected = false; setHqSelected(false); }} aria-label="Close HQ panel"><X /></button>
            <div className="position-heading">
              <span className="position-badge hq-badge is-unit-art">
                <img src={HQ_ART.src} alt="" width={86} height={86} draggable={false} />
              </span>
              <div>
                <p>Headquarters · Defense network</p>
                <h2>{selectedHqDefense.name}</h2>
                <span>Defense {game.hqDefenseLevel}/3 · {game.hqKills} kills</span>
              </div>
            </div>
            <div
              className="position-upgrade-meter hq-upgrade-meter"
              aria-label={`HQ defense upgrades ${game.hqDefenseLevel} of 3`}
              style={{ "--upgrade": "#86c7d1" } as React.CSSProperties}
            >
              <div><span>HQ defenses</span><strong>{game.hqDefenseLevel}/3</strong></div>
              <span className="upgrade-meter-pips" aria-hidden="true">
                {[0, 1, 2].map((level) => <i className={level < game.hqDefenseLevel ? "is-filled" : ""} key={level} />)}
              </span>
            </div>
            <div className="position-stats">
              <div><span>Integrity</span><strong>{game.hq}/{game.maxHq}</strong></div>
              <div><span>Range</span><strong>{selectedHqDefense.range || "—"}</strong></div>
              <div><span>Damage</span><strong>{selectedHqDefense.damage || "—"}</strong></div>
              <div><span>Rate</span><strong>{game.hqDefenseLevel ? `${(1 / selectedHqDefense.cooldown).toFixed(1)}/s` : "—"}</strong></div>
            </div>
            <p className="hq-defense-description">{selectedHqDefense.description}</p>
            <div className="upgrade-actions">
              {nextHqDefense ? (
                <button type="button" className="upgrade-main" onClick={upgradeHq} disabled={hud.supply < nextHqDefense.upgradeCost}>
                  <span><small>Defense layer {game.hqDefenseLevel + 1}</small><strong>{nextHqDefense.name}</strong><em>+{nextHqDefense.integrityBoost} HQ integrity · {nextHqDefense.allTargets ? "air + ground" : "ground defense"}</em></span>
                  <b>{nextHqDefense.upgradeCost} <small>supply</small></b>
                </button>
              ) : (
                <div className="hq-maxed"><Shield /><span><strong>Fortress complete</strong><small>All HQ defenses operational</small></span></div>
              )}
            </div>
          </aside>
        )}

        {selectedPosition && selectedStats && (
          <aside className="position-panel" key={`${selectedPosition.id}-${panelVersion}`}>
            <button className="panel-close" onClick={() => selectPosition(null)} aria-label="Close position panel"><X /></button>
            <div className="position-heading">
              <span className={`position-badge unit-${selectedPosition.family} is-unit-art`}>
                <img src={UNIT_ART[selectedPosition.family].src} alt="" width={72} height={72} draggable={false} />
              </span>
              <div>
                <p>{FAMILIES[selectedPosition.family].name} · {selectedPosition.rank < 2 ? "Trunk" : DOCTRINES[selectedPosition.doctrine!].name}</p>
                <h2>{positionName(selectedPosition).name}</h2>
                <span>{positionName(selectedPosition).year} · {selectedPosition.kills} kills</span>
              </div>
            </div>
            <div
              className="position-upgrade-meter"
              aria-label={`Field upgrades ${Math.min(4, selectedPosition.rank)} of 4${selectedPosition.veteran ? `, veteran ${selectedPosition.veteran}` : ""}`}
              style={{ "--upgrade": selectedPosition.doctrine ? DOCTRINES[selectedPosition.doctrine].color : "#e6cb72" } as React.CSSProperties}
            >
              <div><span>Field upgrades</span><strong>{Math.min(4, selectedPosition.rank)}/4{selectedPosition.veteran > 0 ? ` · Veteran ${selectedPosition.veteran}` : ""}</strong></div>
              <span className="upgrade-meter-pips" aria-hidden="true">
                {[0, 1, 2, 3].map((level) => <i className={level < selectedPosition.rank ? "is-filled" : ""} key={level} />)}
              </span>
            </div>
            <div className="position-stats">
              <div><span>Damage</span><strong>{Math.round(selectedStats.damage)}</strong></div>
              <div><span>Range</span><strong>{Math.round(selectedStats.range)}</strong></div>
              <div>
                <span>{selectedPosition.family === "airbase" ? "Sorties" : "Rate"}</span>
                <strong>{selectedPosition.family === "airbase" ? `${(60 / selectedStats.cooldown).toFixed(1)}/m` : `${(1 / selectedStats.cooldown).toFixed(1)}/s`}</strong>
              </div>
              <div><span>Health</span><strong>{Math.ceil(selectedPosition.hp)}/{Math.round(selectedPosition.maxHp)}</strong></div>
            </div>
            {selectedPosition.doctrine && <div className="doctrine-chip" style={{ "--doctrine": DOCTRINES[selectedPosition.doctrine].color } as React.CSSProperties}><i /> {DOCTRINES[selectedPosition.doctrine].name} doctrine</div>}

            {selectedPosition.family === "airbase" && (
              <div className="upgrade-section-heading"><Wrench /><span>Airport upgrades</span><small>Runway, operations, and air wing</small></div>
            )}
            <div className="upgrade-actions">
              {selectedPosition.rank === 0 && (
                <button type="button" className="upgrade-main" onClick={() => upgradeSelected()} disabled={hud.supply < upgradeCost(0)}>
                  <span><small>Trunk tier II</small><strong>{HARDWARE[selectedPosition.family].trunk[1].name}</strong><em>{HARDWARE[selectedPosition.family].trunk[1].year}</em></span>
                  <b>{upgradeCost(0)} <small>supply</small></b>
                </button>
              )}
              {selectedPosition.rank === 1 && (
                <div className="doctrine-grid">
                  {DOCTRINE_ORDER.map((doctrine) => {
                    const hardware = HARDWARE[selectedPosition.family].doctrines[doctrine][0];
                    return (
                      <button type="button" key={doctrine} onClick={() => upgradeSelected(doctrine)} disabled={hud.supply < upgradeCost(1)} style={{ "--doctrine": DOCTRINES[doctrine].color } as React.CSSProperties}>
                        <i />
                        <span><small>{DOCTRINES[doctrine].name}</small><strong>{hardware.name}</strong><em>{hardware.year}</em></span>
                        <b>{upgradeCost(1)}</b>
                      </button>
                    );
                  })}
                  <p className="doctrine-warning"><Lock /> Choosing one doctrine permanently locks the other three for this position.</p>
                </div>
              )}
              {selectedPosition.rank >= 2 && selectedPosition.rank < 4 && selectedPosition.doctrine && (() => {
                const modernLocked = selectedPosition.rank === 3 && !purchases.has(`tech-${selectedPosition.doctrine}`);
                const hardware = HARDWARE[selectedPosition.family].doctrines[selectedPosition.doctrine][selectedPosition.rank - 1];
                const cost = upgradeCost(selectedPosition.rank);
                return (
                  <button type="button" className={`upgrade-main ${modernLocked ? "is-locked" : ""}`} onClick={() => upgradeSelected()} disabled={modernLocked || hud.supply < cost}>
                    <span><small>Doctrine tier {selectedPosition.rank === 2 ? "II" : "III · modern"}</small><strong>{hardware.name}</strong><em>{hardware.year}</em></span>
                    <b>{modernLocked ? <><Lock /> Armoury</> : <>{cost} <small>supply</small></>}</b>
                  </button>
                );
              })()}
              {selectedPosition.rank >= 4 && (() => {
                const cost = veteranCost(selectedPosition.veteran, purchases.has("cmd-veteran") ? .88 : 1);
                return (
                  <button type="button" className="upgrade-main veteran-upgrade" onClick={() => upgradeSelected()} disabled={hud.supply < cost}>
                    <span><small>Repeatable promotion</small><strong>Veteran {selectedPosition.veteran + 1}</strong><em>+8% damage · +3% range · +7% health</em></span>
                    <b>{cost} <small>supply</small></b>
                  </button>
                );
              })()}
            </div>
            {selectedPosition.family === "airbase" && (
              <div className="air-wing-roster">
                <p><span>Flight line · automatic sorties</span><b>Auto</b></p>
                <div role="list">
                  {(Object.keys(AIRCRAFT_PROFILES) as SortieKind[]).map((kind) => (
                    <span key={kind} title={AIRCRAFT_PROFILES[kind].role} role="listitem">
                      <img src={AIRCRAFT_ART[kind].src} alt="" width={46} height={46} draggable={false} />
                      <small><strong>{AIRCRAFT_PROFILES[kind].name}</strong><span>{AIRCRAFT_PROFILES[kind].role}</span></small>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedPosition.family === "tank" && (
              <button className="redeploy-button" onClick={beginRedeploy} disabled={Boolean(selectedPosition.moving)}>
                <ChevronRight /> {selectedPosition.moving ? "Redeploying…" : "Redeploy tank"}
              </button>
            )}
          </aside>
        )}
      </section>

      <Dialog open={briefingOpen}>
        <DialogContent className="game-dialog briefing-dialog" showCloseButton={false} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <div className="dialog-kicker"><span>{game.endlessMode ? "War game" : `Front ${String(frontIndex + 1).padStart(2, "0")}`}</span><span>{front.theatre}</span></div>
            <DialogTitle>{game.endlessMode ? "Endless defense" : front.name}</DialogTitle>
            <DialogDescription>{front.place} · {game.endlessMode ? "No wave limit" : front.year}</DialogDescription>
          </DialogHeader>
          <div className="briefing-threat"><Target /><div><span>Command warning</span><strong>{front.threat}</strong></div></div>
          <p className="briefing-advice">{front.advice}</p>
          <div className="briefing-stats"><span>{game.endlessMode ? "∞ waves" : `${front.waveCount} waves`}</span><span>{front.paths.length} {front.paths.length === 1 ? "lane" : "lanes"}</span><span>{Math.round(game.supply)} starting supply</span></div>
          <DialogFooter>
            <button className="dialog-primary" onClick={() => { ensureAudio(); setBriefingOpen(false); }}>Open command table <ChevronRight /></button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="game-dialog manual-dialog">
          <DialogHeader><DialogTitle>Field manual</DialogTitle><DialogDescription>Eight rules decide every front.</DialogDescription></DialogHeader>
          <div className="manual-rules">
            <div><span>01</span><p><strong>Respect the dead zone.</strong> Artillery and AT cannot hit targets inside the orange ring.</p></div>
            <div><span>02</span><p><strong>Read the threat.</strong> Bombers require Air Defense or Airport interceptors; armour requires piercing AT fire.</p></div>
            <div><span>03</span><p><strong>Tanks are movable walls.</strong> Enemies stop and attack them, but moving tanks cannot fight or block.</p></div>
            <div><span>04</span><p><strong>Doctrine is permanent per position.</strong> Firepower, Optics, Mobility, or Logistics—choose once.</p></div>
            <div><span>05</span><p><strong>Supply should work.</strong> Kills, waves, and Logistics earn it; veteran promotions always spend it.</p></div>
            <div><span>06</span><p><strong>Control the air.</strong> Airports automatically dispatch interceptors, multirole fighters, strike jets, or gunships for each threat.</p></div>
            <div><span>07</span><p><strong>Fortify command.</strong> Tap the HQ to install sentries, counter-air missiles, and a fortress defense network.</p></div>
            <div><span>08</span><p><strong>Hold beyond the mission.</strong> Every cleared map can continue immediately in infinite mode.</p></div>
          </div>
          <p className="text-xs text-muted-foreground"><a href="./assets/machine-gun/credits.html" target="_blank" rel="noreferrer" className="underline">Machine gun model credit and license</a> · <a href="./assets/artillery/credits.html" target="_blank" rel="noreferrer" className="underline">Artillery model credit and license</a></p>
        </DialogContent>
      </Dialog>

      <Dialog open={outcome !== null}>
        <DialogContent className="game-dialog outcome-dialog" showCloseButton={false} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          {outcome && <>
            <div className={`outcome-emblem ${outcome.kind}`}><Shield /></div>
            <DialogHeader>
              <div className="dialog-kicker"><span>{front.place}</span><span>{front.year}</span></div>
              <DialogTitle>{outcome.kind === "victory" ? "Front held" : "HQ overrun"}</DialogTitle>
              <DialogDescription>{outcome.kind === "victory" ? `All ${front.waveCount} waves defeated.` : game.endlessMode ? `The infinite defense fell during wave ${game.wave + 1}.` : `Your line broke during wave ${game.wave + 1}.`}</DialogDescription>
            </DialogHeader>
            {outcome.kind === "victory" ? (
              <div className="outcome-stars"><Stars count={outcome.stars} /><p>{outcome.stars === 3 ? "No HQ lost — flawless defense." : outcome.stars === 2 ? "Five or fewer HQ lost." : "The line survived."}</p></div>
            ) : (
              <div className="defeat-intel"><Target /><p><strong>Remember:</strong> {front.threat}</p></div>
            )}
            <div className="outcome-stats"><div><span>Wave</span><strong>{game.wave}/{game.endlessMode ? "∞" : front.waveCount}</strong></div><div><span>HQ</span><strong>{game.hq}/{game.maxHq}</strong></div><div><span>Positions</span><strong>{game.positions.length}</strong></div></div>
            <DialogFooter>
              <button className="dialog-secondary" onClick={onExit}><Map /> Campaign map</button>
              {outcome.kind === "victory" ? (
                <button className="dialog-primary" onClick={continueEndless}><FastForward /> Continue infinitely</button>
              ) : (
                <button className="dialog-primary" onClick={onRetry}><RotateCw /> Retry front</button>
              )}
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </main>
  );
}

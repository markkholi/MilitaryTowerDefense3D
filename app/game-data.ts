export type Point = { x: number; y: number };

export type FamilyKey = "mg" | "artillery" | "at" | "air" | "airbase" | "tank";
export type Doctrine = "firepower" | "optics" | "mobility" | "logistics";
export type EnemyType =
  | "infantry"
  | "scout"
  | "brute"
  | "slinger"
  | "bomber"
  | "bulwark"
  | "swarmling"
  | "siege";
export type SupportKey = "airstrike" | "overdrive" | "repair" | "smoke" | "minefield";

export type Hardware = { name: string; year: number };

export type FamilyDefinition = {
  id: FamilyKey;
  short: string;
  name: string;
  role: string;
  signature: string;
  baseCost: number;
  range: number;
  minRange: number;
  damage: number;
  cooldown: number;
  splash: number;
  maxHp: number;
  color: string;
  accent: string;
  airOnly?: boolean;
  allTargets?: boolean;
  pierce?: boolean;
  blocks?: boolean;
};

export const DOCTRINES: Record<Doctrine, {
  name: string;
  short: string;
  description: string;
  color: string;
}> = {
  firepower: {
    name: "Firepower",
    short: "FP",
    description: "Maximum damage per hit.",
    color: "#ee6947",
  },
  optics: {
    name: "Optics",
    short: "OP",
    description: "Longer reach and earlier contact.",
    color: "#73c7d4",
  },
  mobility: {
    name: "Mobility",
    short: "MB",
    description: "Faster fire, slows, and rapid redeployment.",
    color: "#e7b84d",
  },
  logistics: {
    name: "Logistics",
    short: "LG",
    description: "Nearby fire-rate support and passive supply.",
    color: "#77b86a",
  },
};

export const FAMILIES: Record<FamilyKey, FamilyDefinition> = {
  mg: {
    id: "mg",
    short: "MG",
    name: "MG Nest",
    role: "Cheap suppression",
    signature: "Fast fire · no dead zone",
    baseCost: 90,
    range: 132,
    minRange: 0,
    damage: 13,
    cooldown: 0.24,
    splash: 0,
    maxHp: 220,
    color: "#726b4b",
    accent: "#d9c880",
  },
  artillery: {
    id: "artillery",
    short: "ART",
    name: "Artillery",
    role: "Wide-area damage",
    signature: "Long range · large dead zone",
    baseCost: 210,
    range: 262,
    minRange: 104,
    damage: 68,
    cooldown: 1.75,
    splash: 58,
    maxHp: 260,
    color: "#665849",
    accent: "#e2a565",
  },
  at: {
    id: "at",
    short: "AT",
    name: "AT Post",
    role: "Armour killer",
    signature: "Piercing · narrow dead zone",
    baseCost: 185,
    range: 224,
    minRange: 58,
    damage: 106,
    cooldown: 1.42,
    splash: 0,
    maxHp: 250,
    color: "#5a6850",
    accent: "#a8c17a",
    pierce: true,
  },
  air: {
    id: "air",
    short: "AD",
    name: "Air Defense",
    role: "Static anti-air",
    signature: "Fast, low-cost bomber defense",
    baseCost: 170,
    range: 235,
    minRange: 0,
    damage: 42,
    cooldown: 0.62,
    splash: 18,
    maxHp: 235,
    color: "#415e67",
    accent: "#7ed0df",
    airOnly: true,
  },
  airbase: {
    id: "airbase",
    short: "AIR",
    name: "Airport",
    role: "Interception and strike",
    signature: "Intercepts aircraft · strikes ground",
    baseCost: 400,
    range: 395,
    minRange: 0,
    damage: 150,
    cooldown: 6.2,
    splash: 38,
    maxHp: 360,
    color: "#4b5960",
    accent: "#91c6d4",
    allTargets: true,
    pierce: true,
  },
  tank: {
    id: "tank",
    short: "TNK",
    name: "Tank",
    role: "Mobile roadblock",
    signature: "Blocks enemies · can redeploy",
    baseCost: 255,
    range: 114,
    minRange: 0,
    damage: 31,
    cooldown: 0.62,
    splash: 12,
    maxHp: 720,
    color: "#4b5c42",
    accent: "#b8ce81",
    blocks: true,
  },
};

export const HARDWARE: Record<FamilyKey, {
  trunk: [Hardware, Hardware];
  doctrines: Record<Doctrine, [Hardware, Hardware, Hardware]>;
}> = {
  mg: {
    trunk: [
      { name: "Maxim MG 08", year: 1908 },
      { name: "M2 Browning", year: 1933 },
    ],
    doctrines: {
      firepower: [
        { name: "MG 42", year: 1942 },
        { name: "M134 Minigun", year: 1963 },
        { name: "XM806", year: 2012 },
      ],
      optics: [
        { name: "M1919A6", year: 1943 },
        { name: "M60E3", year: 1986 },
        { name: "M240L", year: 2010 },
      ],
      mobility: [
        { name: "Bren Mk II", year: 1941 },
        { name: "FN MAG 58", year: 1958 },
        { name: "M250", year: 2022 },
      ],
      logistics: [
        { name: "SG-43 Goryunov", year: 1943 },
        { name: "PKM", year: 1961 },
        { name: "HK GMG", year: 1995 },
      ],
    },
  },
  artillery: {
    trunk: [
      { name: "QF 18-pounder", year: 1904 },
      { name: "M2A1 105 mm", year: 1940 },
    ],
    doctrines: {
      firepower: [
        { name: "M7 Priest", year: 1942 },
        { name: "M110", year: 1963 },
        { name: "M109A7 Paladin", year: 2015 },
      ],
      optics: [
        { name: "M114 155 mm", year: 1942 },
        { name: "M198", year: 1979 },
        { name: "M777A2", year: 2005 },
      ],
      mobility: [
        { name: "Sexton II", year: 1944 },
        { name: "2S1 Gvozdika", year: 1972 },
        { name: "CAESAR 6×6", year: 2008 },
      ],
      logistics: [
        { name: "M44", year: 1954 },
        { name: "M109A2", year: 1979 },
        { name: "M142 HIMARS", year: 2005 },
      ],
    },
  },
  at: {
    trunk: [
      { name: "M1916 37 mm", year: 1916 },
      { name: "QF 6-pounder", year: 1942 },
    ],
    doctrines: {
      firepower: [
        { name: "QF 17-pounder", year: 1943 },
        { name: "BGM-71 TOW", year: 1970 },
        { name: "FGM-148 Javelin", year: 1996 },
      ],
      optics: [
        { name: "M40A1 Recoilless", year: 1955 },
        { name: "TOW 2B", year: 1992 },
        { name: "Spike LR2", year: 2017 },
      ],
      mobility: [
        { name: "Panzerfaust 60", year: 1944 },
        { name: "AT4", year: 1987 },
        { name: "NLAW", year: 2009 },
      ],
      logistics: [
        { name: "M20 Super Bazooka", year: 1950 },
        { name: "Carl Gustaf M3", year: 1991 },
        { name: "Carl Gustaf M4", year: 2014 },
      ],
    },
  },
  air: {
    trunk: [
      { name: "QF 3-inch 20 cwt", year: 1914 },
      { name: "Bofors 40 mm L/60", year: 1934 },
    ],
    doctrines: {
      firepower: [
        { name: "ZSU-57-2", year: 1955 },
        { name: "ZSU-23-4 Shilka", year: 1965 },
        { name: "Skyranger 30", year: 2024 },
      ],
      optics: [
        { name: "MIM-23 HAWK", year: 1959 },
        { name: "Patriot PAC-2", year: 1990 },
        { name: "Patriot PAC-3 MSE", year: 2015 },
      ],
      mobility: [
        { name: "FIM-43 Redeye", year: 1968 },
        { name: "FIM-92 Stinger", year: 1981 },
        { name: "AN/TWQ-1 Avenger", year: 1989 },
      ],
      logistics: [
        { name: "M42 Duster", year: 1952 },
        { name: "Flakpanzer Gepard", year: 1976 },
        { name: "NASAMS 3", year: 2019 },
      ],
    },
  },
  airbase: {
    trunk: [
      { name: "Forward Landing Ground", year: 1916 },
      { name: "Fighter Operations Field", year: 1940 },
    ],
    doctrines: {
      firepower: [
        { name: "Armed Recon Wing", year: 1944 },
        { name: "F-4 Phantom Wing", year: 1960 },
        { name: "F-15E Strike Wing", year: 1988 },
      ],
      optics: [
        { name: "Ground Control Intercept", year: 1943 },
        { name: "E-2 Hawkeye Network", year: 1964 },
        { name: "AWACS Battle Network", year: 1977 },
      ],
      mobility: [
        { name: "Expeditionary Air Wing", year: 1944 },
        { name: "Harrier Forward Base", year: 1969 },
        { name: "F-35B Expeditionary Wing", year: 2015 },
      ],
      logistics: [
        { name: "Air Service Group", year: 1942 },
        { name: "Tactical Airlift Wing", year: 1965 },
        { name: "Agile Combat Employment", year: 2020 },
      ],
    },
  },
  tank: {
    trunk: [
      { name: "Mark I", year: 1916 },
      { name: "M4 Sherman", year: 1942 },
    ],
    doctrines: {
      firepower: [
        { name: "M26 Pershing", year: 1945 },
        { name: "M1A2 Abrams", year: 1992 },
        { name: "M1A2 SEP v4", year: 2023 },
      ],
      optics: [
        { name: "Centurion Mk 5/2", year: 1959 },
        { name: "M60A3 TTS", year: 1978 },
        { name: "Leopard 2A7V", year: 2021 },
      ],
      mobility: [
        { name: "M18 Hellcat", year: 1944 },
        { name: "Leopard 1A1", year: 1967 },
        { name: "K2 Black Panther", year: 2014 },
      ],
      logistics: [
        { name: "Churchill Crocodile", year: 1944 },
        { name: "M88A1", year: 1977 },
        { name: "M1A2 SEPv3", year: 2020 },
      ],
    },
  },
};

export const FAMILY_ORDER: FamilyKey[] = ["mg", "artillery", "at", "air", "airbase", "tank"];
export const DOCTRINE_ORDER: Doctrine[] = ["firepower", "optics", "mobility", "logistics"];

export type EnemyDefinition = {
  id: EnemyType;
  name: string;
  short: string;
  behavior: string;
  punish: string;
  hp: number;
  speed: number;
  armor: number;
  reward: number;
  hqCost: number;
  color: string;
  air?: boolean;
  ranged?: boolean;
  splashResist?: number;
  attack: number;
};

export const ENEMIES: Record<EnemyType, EnemyDefinition> = {
  infantry: {
    id: "infantry", name: "Infantry", short: "INF", behavior: "Baseline walker",
    punish: "The tutorial enemy", hp: 82, speed: 39, armor: 0, reward: 10, hqCost: 1,
    color: "#d0bd8d", attack: 22,
  },
  scout: {
    id: "scout", name: "Scout", short: "SCT", behavior: "Fast and fragile",
    punish: "Slow, short-range defenses", hp: 58, speed: 73, armor: 0, reward: 12, hqCost: 1,
    color: "#e8d66e", attack: 18,
  },
  brute: {
    id: "brute", name: "Brute", short: "BRT", behavior: "Slow, armoured, high health",
    punish: "Low damage per shot", hp: 310, speed: 25, armor: 8, reward: 25, hqCost: 2,
    color: "#a98565", attack: 36,
  },
  slinger: {
    id: "slinger", name: "Slinger", short: "SLG", behavior: "Stops to fire at positions",
    punish: "No reach or repair plan", hp: 145, speed: 34, armor: 2, reward: 22, hqCost: 1,
    color: "#c88972", ranged: true, attack: 31,
  },
  bomber: {
    id: "bomber", name: "Bomber", short: "AIR", behavior: "Flies straight to HQ; only Air Defense can hit it",
    punish: "Having no Air Defense", hp: 205, speed: 48, armor: 3, reward: 30, hqCost: 2,
    color: "#7fc4d2", air: true, attack: 0,
  },
  bulwark: {
    id: "bulwark", name: "Bulwark", short: "BLW", behavior: "Heavy armour and splash resistance",
    punish: "Non-piercing and splash-only builds", hp: 520, speed: 21, armor: 18, reward: 42, hqCost: 3,
    color: "#89919a", splashResist: 0.72, attack: 48,
  },
  swarmling: {
    id: "swarmling", name: "Swarmling", short: "SWR", behavior: "Huge, tightly packed clusters",
    punish: "Single-target builds", hp: 38, speed: 47, armor: 0, reward: 6, hqCost: 1,
    color: "#d39e56", attack: 12,
  },
  siege: {
    id: "siege", name: "Siege Column", short: "BOSS", behavior: "Boss: armour, health, and splash resistance",
    punish: "Every weakness at once", hp: 1900, speed: 16, armor: 24, reward: 160, hqCost: 5,
    color: "#a84f43", splashResist: 0.82, attack: 72,
  },
};

export const ENEMY_COMBAT_DAMAGE_SCALE = 0.9;

export type WaveGroup = {
  type: EnemyType;
  count: number;
  tier: number;
  spacing: number;
  delay: number;
  lane?: number;
};

export const AUTHORED_WAVES: WaveGroup[][] = [
  [{ type: "infantry", count: 7, tier: 1, spacing: 0.78, delay: 0 }],
  [{ type: "infantry", count: 9, tier: 1, spacing: 0.62, delay: 0 }, { type: "scout", count: 3, tier: 1, spacing: 0.8, delay: 3.1 }],
  [{ type: "scout", count: 7, tier: 1, spacing: 0.64, delay: 0 }, { type: "infantry", count: 7, tier: 1, spacing: 0.72, delay: 2 }],
  [{ type: "infantry", count: 12, tier: 1, spacing: 0.45, delay: 0 }, { type: "brute", count: 2, tier: 1, spacing: 1.8, delay: 3.2 }],
  [{ type: "swarmling", count: 18, tier: 1, spacing: 0.25, delay: 0 }, { type: "brute", count: 3, tier: 1, spacing: 1.5, delay: 3.5 }],
  [{ type: "slinger", count: 5, tier: 1, spacing: 1.05, delay: 0 }, { type: "infantry", count: 12, tier: 1, spacing: 0.48, delay: 1.4 }],
  [{ type: "brute", count: 5, tier: 1, spacing: 1.2, delay: 0 }, { type: "scout", count: 10, tier: 1, spacing: 0.5, delay: 2.5 }],
  [{ type: "bomber", count: 4, tier: 1, spacing: 1.15, delay: 0 }, { type: "infantry", count: 14, tier: 1, spacing: 0.44, delay: 1 }],
  [{ type: "bulwark", count: 3, tier: 1, spacing: 1.7, delay: 0 }, { type: "swarmling", count: 22, tier: 1, spacing: 0.22, delay: 2 }],
  [{ type: "slinger", count: 8, tier: 1, spacing: 0.9, delay: 0 }, { type: "brute", count: 6, tier: 1, spacing: 1.05, delay: 2.5 }],
  [{ type: "scout", count: 14, tier: 2, spacing: 0.38, delay: 0 }, { type: "bomber", count: 6, tier: 1, spacing: 0.9, delay: 2 }],
  [{ type: "bulwark", count: 5, tier: 1, spacing: 1.25, delay: 0 }, { type: "slinger", count: 8, tier: 2, spacing: 0.72, delay: 1.8 }],
  [{ type: "swarmling", count: 30, tier: 2, spacing: 0.16, delay: 0 }, { type: "brute", count: 7, tier: 2, spacing: 0.9, delay: 2.8 }],
  [{ type: "bomber", count: 9, tier: 2, spacing: 0.65, delay: 0 }, { type: "bulwark", count: 5, tier: 2, spacing: 1.1, delay: 2.1 }],
  [{ type: "infantry", count: 20, tier: 3, spacing: 0.32, delay: 0 }, { type: "slinger", count: 10, tier: 2, spacing: 0.62, delay: 1.2 }],
  [{ type: "siege", count: 1, tier: 1, spacing: 1, delay: 0 }, { type: "scout", count: 18, tier: 3, spacing: 0.3, delay: 2.5 }],
  [{ type: "bulwark", count: 8, tier: 3, spacing: 0.8, delay: 0 }, { type: "bomber", count: 12, tier: 2, spacing: 0.52, delay: 1.5 }],
  [{ type: "swarmling", count: 38, tier: 3, spacing: 0.13, delay: 0 }, { type: "slinger", count: 12, tier: 3, spacing: 0.55, delay: 2.2 }],
  [{ type: "brute", count: 12, tier: 4, spacing: 0.72, delay: 0 }, { type: "scout", count: 22, tier: 4, spacing: 0.26, delay: 1.5 }, { type: "bomber", count: 10, tier: 3, spacing: 0.55, delay: 3 }],
  [{ type: "siege", count: 2, tier: 2, spacing: 5, delay: 0 }, { type: "bulwark", count: 9, tier: 4, spacing: 0.72, delay: 1 }, { type: "bomber", count: 12, tier: 4, spacing: 0.45, delay: 2 }],
];

export type Front = {
  id: string;
  name: string;
  place: string;
  year: number;
  theatre: string;
  threat: string;
  advice: string;
  waveCount: number;
  startSupply: number;
  hq: number;
  difficulty: number;
  paths: Point[][];
  terrain: "mud" | "desert" | "ridge" | "jungle" | "lava" | "salt" | "urban" | "mountain" | "city" | "farmland" | "snow";
  swaps: Partial<Record<EnemyType, EnemyType>>;
};

export const FRONTS: Front[] = [
  {
    id: "verdun", name: "The Long Approach", place: "Verdun", year: 1916,
    theatre: "Western Front", threat: "Long infantry columns will test basic coverage.",
    advice: "The obvious clearing beside the straight is inside Artillery's dead zone. Read both range rings.",
    waveCount: 26, startSupply: 620, hq: 20, difficulty: 0.88, terrain: "mud", swaps: {},
    paths: [[{ x: -35, y: 128 }, { x: 245, y: 128 }, { x: 410, y: 270 }, { x: 710, y: 270 }, { x: 805, y: 480 }, { x: 1035, y: 480 }]],
  },
  {
    id: "el-alamein", name: "Desert Choke", place: "El Alamein", year: 1942,
    theatre: "North Africa", threat: "Fast scouts screen armoured brutes through tight turns.",
    advice: "Corners bunch targets. Splash clears the screen; AT fire opens the armour behind it.",
    waveCount: 30, startSupply: 700, hq: 20, difficulty: 0.98, terrain: "desert",
    swaps: { infantry: "scout" },
    paths: [[{ x: -30, y: 520 }, { x: 215, y: 520 }, { x: 215, y: 215 }, { x: 485, y: 215 }, { x: 485, y: 430 }, { x: 760, y: 430 }, { x: 760, y: 115 }, { x: 1030, y: 115 }]],
  },
  {
    id: "imjin", name: "Two Bridges", place: "Imjin River", year: 1951,
    theatre: "Korean War", threat: "Two lanes split every wave. One tank cannot hold both.",
    advice: "Redeploy tanks between lanes, or build a second blocker before the pressure peaks.",
    waveCount: 32, startSupply: 820, hq: 22, difficulty: 1.05, terrain: "ridge",
    swaps: { scout: "brute" },
    paths: [
      [{ x: -30, y: 150 }, { x: 240, y: 150 }, { x: 390, y: 310 }, { x: 705, y: 310 }, { x: 870, y: 210 }, { x: 1030, y: 210 }],
      [{ x: -30, y: 540 }, { x: 250, y: 540 }, { x: 395, y: 365 }, { x: 705, y: 365 }, { x: 870, y: 440 }, { x: 1030, y: 440 }],
    ],
  },
  {
    id: "khe-sanh", name: "Siege Perimeter", place: "Khe Sanh", year: 1968,
    theatre: "Vietnam War", threat: "Ranged slingers stop outside weak defenses and fire back.",
    advice: "Optics reaches them first. Logistics keeps distant batteries firing under pressure.",
    waveCount: 34, startSupply: 860, hq: 20, difficulty: 1.13, terrain: "jungle",
    swaps: { infantry: "slinger", scout: "swarmling" },
    paths: [[{ x: -30, y: 330 }, { x: 145, y: 330 }, { x: 265, y: 140 }, { x: 445, y: 510 }, { x: 625, y: 145 }, { x: 805, y: 500 }, { x: 1030, y: 325 }]],
  },
  {
    id: "golan", name: "Armour on the Ridge", place: "Golan Heights", year: 1973,
    theatre: "Yom Kippur War", threat: "Bulwarks resist armour and most splash damage.",
    advice: "Non-piercing fire barely dents this front. Field AT Posts and keep them outside their dead zones.",
    waveCount: 36, startSupply: 930, hq: 22, difficulty: 1.22, terrain: "lava",
    swaps: { infantry: "bulwark", scout: "brute" },
    paths: [[{ x: -40, y: 560 }, { x: 185, y: 445 }, { x: 315, y: 205 }, { x: 505, y: 120 }, { x: 660, y: 320 }, { x: 820, y: 225 }, { x: 1040, y: 105 }]],
  },
  {
    id: "khafji", name: "The Missile Sky", place: "Khafji", year: 1991,
    theatre: "Gulf War", threat: "Bombers ignore roads and blockers. Air Defense or Airport interceptors must stop them.",
    advice: "Field Air Defense for rapid coverage, or an Airport that intercepts bombers and strikes ground columns.",
    waveCount: 40, startSupply: 1_020, hq: 24, difficulty: 1.32, terrain: "salt",
    swaps: { infantry: "bomber", scout: "bomber", brute: "bulwark" },
    paths: [[{ x: -30, y: 360 }, { x: 250, y: 360 }, { x: 485, y: 235 }, { x: 700, y: 235 }, { x: 1030, y: 325 }]],
  },
  {
    id: "mogadishu", name: "Urban Crossfire", place: "Mogadishu", year: 1993,
    theatre: "Somalia Intervention", threat: "Swarms and ranged teams press two streets at once.",
    advice: "Gunships punish clustered infantry while tanks anchor the point where both avenues converge.",
    waveCount: 42, startSupply: 1_080, hq: 24, difficulty: 1.34, terrain: "urban",
    swaps: { infantry: "swarmling", scout: "slinger", brute: "bulwark" },
    paths: [
      [{ x: -35, y: 105 }, { x: 245, y: 105 }, { x: 405, y: 245 }, { x: 650, y: 145 }, { x: 825, y: 325 }, { x: 1035, y: 325 }],
      [{ x: -35, y: 555 }, { x: 245, y: 555 }, { x: 405, y: 405 }, { x: 650, y: 520 }, { x: 825, y: 325 }, { x: 1035, y: 325 }],
    ],
  },
  {
    id: "tora-bora", name: "Mountain Funnel", place: "Tora Bora", year: 2001,
    theatre: "Afghanistan", threat: "Armour and aircraft exploit a long, exposed mountain approach.",
    advice: "Long-range Optics and mixed air cover can engage threats before the final switchback.",
    waveCount: 44, startSupply: 1_140, hq: 25, difficulty: 1.37, terrain: "mountain",
    swaps: { infantry: "brute", scout: "bomber" },
    paths: [[{ x: -35, y: 555 }, { x: 180, y: 485 }, { x: 285, y: 210 }, { x: 470, y: 115 }, { x: 570, y: 390 }, { x: 755, y: 500 }, { x: 845, y: 265 }, { x: 1035, y: 265 }]],
  },
  {
    id: "fallujah", name: "Block by Block", place: "Fallujah", year: 2004,
    theatre: "Iraq War", threat: "Ranged teams hide heavy columns inside dense urban waves.",
    advice: "Layer suppression with piercing fire, then let strike aircraft break the armoured core.",
    waveCount: 46, startSupply: 1_200, hq: 25, difficulty: 1.4, terrain: "city",
    swaps: { infantry: "slinger", scout: "swarmling", brute: "bulwark" },
    paths: [
      [{ x: -35, y: 165 }, { x: 220, y: 165 }, { x: 220, y: 360 }, { x: 470, y: 360 }, { x: 470, y: 175 }, { x: 720, y: 175 }, { x: 830, y: 325 }, { x: 1035, y: 325 }],
      [{ x: -35, y: 520 }, { x: 310, y: 520 }, { x: 310, y: 420 }, { x: 610, y: 420 }, { x: 610, y: 540 }, { x: 790, y: 540 }, { x: 830, y: 325 }, { x: 1035, y: 325 }],
    ],
  },
  {
    id: "marjah", name: "Canal Network", place: "Marjah", year: 2010,
    theatre: "Afghanistan", threat: "Fast raiders and bombers arrive across separated farm tracks.",
    advice: "Central Airports cover both lanes; gunships thrive over clusters while interceptors guard the HQ.",
    waveCount: 48, startSupply: 1_270, hq: 26, difficulty: 1.44, terrain: "farmland",
    swaps: { infantry: "swarmling", scout: "bomber", brute: "slinger" },
    paths: [
      [{ x: -35, y: 120 }, { x: 175, y: 120 }, { x: 320, y: 285 }, { x: 530, y: 210 }, { x: 720, y: 330 }, { x: 1035, y: 330 }],
      [{ x: -35, y: 555 }, { x: 210, y: 555 }, { x: 360, y: 410 }, { x: 535, y: 500 }, { x: 720, y: 330 }, { x: 1035, y: 330 }],
    ],
  },
  {
    id: "kyiv", name: "Winter Counterstroke", place: "Kyiv Outskirts", year: 2022,
    theatre: "Ukraine", threat: "Three converging lanes combine armour, air threats, and siege columns.",
    advice: "Upgrade the HQ into a fortress and balance all four air roles before the late escalation.",
    waveCount: 50, startSupply: 1_350, hq: 28, difficulty: 1.48, terrain: "snow",
    swaps: { infantry: "bulwark", scout: "bomber", brute: "slinger" },
    paths: [
      [{ x: -35, y: 90 }, { x: 245, y: 90 }, { x: 420, y: 250 }, { x: 660, y: 175 }, { x: 820, y: 325 }, { x: 1035, y: 325 }],
      [{ x: -35, y: 325 }, { x: 270, y: 325 }, { x: 455, y: 325 }, { x: 650, y: 325 }, { x: 1035, y: 325 }],
      [{ x: -35, y: 570 }, { x: 245, y: 570 }, { x: 420, y: 410 }, { x: 660, y: 485 }, { x: 820, y: 325 }, { x: 1035, y: 325 }],
    ],
  },
];

export type HqDefenseLevel = {
  name: string;
  description: string;
  upgradeCost: number;
  integrityBoost: number;
  range: number;
  damage: number;
  cooldown: number;
  splash: number;
  allTargets: boolean;
};

export const HQ_DEFENSE_LEVELS: HqDefenseLevel[] = [
  { name: "Command Post", description: "Select the HQ to install its first defensive layer.", upgradeCost: 0, integrityBoost: 0, range: 0, damage: 0, cooldown: 1, splash: 0, allTargets: false },
  { name: "Perimeter Sentries", description: "Twin automatic weapons engage ground troops near the command post.", upgradeCost: 220, integrityBoost: 3, range: 145, damage: 18, cooldown: .34, splash: 0, allTargets: false },
  { name: "Counter-Air Battery", description: "Missile defenses engage aircraft and ground vehicles with piercing fire.", upgradeCost: 360, integrityBoost: 4, range: 220, damage: 62, cooldown: .88, splash: 10, allTargets: true },
  { name: "Fortress Network", description: "An integrated weapons network adds rapid fire, splash damage, and maximum reach.", upgradeCost: 560, integrityBoost: 6, range: 285, damage: 108, cooldown: .72, splash: 28, allTargets: true },
];

export type ArmouryItem = {
  id: string;
  column: "tech" | "command" | "arsenal";
  name: string;
  description: string;
  cost: number;
  doctrine?: Doctrine;
  support?: SupportKey;
  requirement?: string;
};

export const ARMOURY_ITEMS: ArmouryItem[] = [
  { id: "tech-firepower", column: "tech", name: "Modern Firepower", description: "Unlock doctrine tier III for Firepower positions.", cost: 2, doctrine: "firepower" },
  { id: "tech-optics", column: "tech", name: "Modern Optics", description: "Unlock doctrine tier III for Optics positions.", cost: 2, doctrine: "optics" },
  { id: "tech-mobility", column: "tech", name: "Modern Mobility", description: "Unlock doctrine tier III for Mobility positions.", cost: 2, doctrine: "mobility" },
  { id: "tech-logistics", column: "tech", name: "Modern Logistics", description: "Unlock doctrine tier III for Logistics positions.", cost: 2, doctrine: "logistics" },
  { id: "cmd-supply-1", column: "command", name: "Quartermaster I", description: "+8% starting supply on every front.", cost: 1 },
  { id: "cmd-supply-2", column: "command", name: "Quartermaster II", description: "A further +8% starting supply.", cost: 2, requirement: "cmd-supply-1" },
  { id: "cmd-hq", column: "command", name: "Hardened HQ", description: "+3 starting HQ on every front.", cost: 2 },
  { id: "cmd-veteran", column: "command", name: "Veteran Bureau", description: "Veteran promotions cost 12% less.", cost: 2 },
  { id: "cmd-support", column: "command", name: "Support Corps", description: "Support powers cost 10% less.", cost: 2 },
  { id: "arsenal-smoke", column: "arsenal", name: "Smoke Screen", description: "Unlock a targeted field that heavily slows enemies.", cost: 2, support: "smoke" },
  { id: "arsenal-mine", column: "arsenal", name: "Minefield", description: "Unlock a piercing road mine for the first enemy through.", cost: 3, support: "minefield" },
];

export const SUPPORTS: Record<SupportKey, {
  name: string;
  short: string;
  description: string;
  cost: number;
  cooldown: number;
  targeted: boolean;
}> = {
  airstrike: { name: "Airstrike", short: "AIR", description: "Bomb an area after a short warning.", cost: 150, cooldown: 19, targeted: true },
  overdrive: { name: "Overdrive", short: "OD", description: "Double all position fire rates for 10 seconds.", cost: 125, cooldown: 26, targeted: false },
  repair: { name: "Repair HQ", short: "HQ+", description: "Restore 4 HQ, up to the starting total.", cost: 180, cooldown: 34, targeted: false },
  smoke: { name: "Smoke Screen", short: "SMK", description: "Heavily slow enemies in an area.", cost: 130, cooldown: 22, targeted: true },
  minefield: { name: "Minefield", short: "MIN", description: "Place a piercing mine on the road.", cost: 110, cooldown: 15, targeted: true },
};

export function waveForFront(frontIndex: number, waveIndex: number): WaveGroup[] {
  const front = FRONTS[frontIndex];
  const source = AUTHORED_WAVES[waveIndex % AUTHORED_WAVES.length];
  const cycle = Math.floor(waveIndex / AUTHORED_WAVES.length);
  return source.map((group, index) => {
    const mapped = front.swaps[group.type] ?? group.type;
    const laneCount = front.paths.length;
    return {
      ...group,
      type: mapped,
      tier: group.tier + cycle,
      count: Math.max(1, Math.round(group.count * (1 + cycle * 0.28))),
      lane: laneCount > 1 ? index % laneCount : 0,
    };
  });
}

export function nextWaveNames(frontIndex: number, waveIndex: number): string[] {
  return [...new Set(waveForFront(frontIndex, waveIndex).map((group) => ENEMIES[group.type].name))];
}

export function hardwareFor(family: FamilyKey, rank: number, doctrine?: Doctrine): Hardware {
  if (rank <= 0) return HARDWARE[family].trunk[0];
  if (rank === 1 || !doctrine) return HARDWARE[family].trunk[1];
  return HARDWARE[family].doctrines[doctrine][Math.min(2, rank - 2)];
}

export function placementCost(family: FamilyKey, currentOwned: number): number {
  return Math.round(FAMILIES[family].baseCost * Math.pow(1.09, Math.max(0, currentOwned - 1)));
}

export function upgradeCost(rank: number): number {
  return [120, 190, 330, 720][Math.max(0, Math.min(3, rank))];
}

export function veteranCost(level: number, discount = 1): number {
  return Math.round(320 * Math.pow(1.28, level) * discount);
}

export function enemyStats(type: EnemyType, tier: number, difficulty: number) {
  const base = ENEMIES[type];
  const tierScale = 1 + 0.45 * (tier - 1);
  return {
    hp: Math.round(base.hp * tierScale * difficulty * 0.93),
    armor: (base.armor + 1.5 * (tier - 1)) * 0.94,
    reward: Math.round(base.reward * (1 + 0.3 * (tier - 1))),
    speed: base.speed * (1 + Math.min(0.18, (tier - 1) * 0.025)),
  };
}

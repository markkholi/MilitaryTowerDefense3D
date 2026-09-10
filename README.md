# Military Tower Defense 3D (MTD3D)

A separate 3D evolution of Military Tower Defense, built from the original game's source. Command eleven historical fronts, from Verdun to Kyiv, with an angled 3D battlefield and spatial combat audio.

## What's new

- Real 3D units: tracked tanks, rotating turrets, recoiling guns, infantry with animated legs, artillery crews, missile vehicles, aircraft, airfields, and fortified HQs.
- Artillery uses the supplied textured 152mm M-10 Howitzer mesh with physically based materials and shadows, with a procedural fallback while the asset loads.
- Air Defense uses the supplied textured MIM-104 Patriot model: weathered launcher, trailer, wheels, stabilizers, independently aiming mount, and missiles with exhaust trails and aerial impact effects. The build menu displays a portrait rendered from the same model.
- Tanks use the supplied M1A2 Woodland Abrams model, with its detailed surface textures, independent turret, recoiling cannon, and muzzle flash. Hulls follow the road when deployed and retain their heading through upgrades.
- AT Posts use the supplied anti-tank turret with its textured stabilizer base, independently aiming armored dome, recoiling barrel, and muzzle-origin firing effects. Full 2K surface maps preserve the painted metal and wear.
- MG Nests use the supplied Auto Turret Machine Gun: full 4K surface textures, a stationary base, independent aiming, short gun recoil, and alternating flashes/tracers at its four barrels.
- Directional lighting, soft shadows, textured terrain, raised battlefield edges, and 3D explosion debris.
- Rotate, tilt, and zoom the camera; selection and placement follow the 3D view.
- Distinct weapon bursts, cannon and artillery reports, missile launches, aircraft flybys, and propeller pulses, with stereo positioning, reverb, variation, and a shared output limiter.
- Mute and volume controls, plus a separate MTD3D save slot.

The original campaigns, combat balance, upgrade doctrines, support powers, and endless mode are retained. The original project has not been modified. See [source provenance](docs/PROVENANCE.md).

## Run locally

Install Node.js 22.13 or newer (Node 24 recommended), then:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and deploy to Verdun. A browser with WebGL 2 and hardware acceleration is required. Sound starts after an interaction.

## Controls

- Choose a defense, then click clear ground to place it. Tanks snap to roads.
- Click a unit or the HQ to inspect and upgrade it.
- Use the camera buttons to rotate, zoom, switch tilt, or reset. Scroll over the battlefield to zoom toward the cursor.
- Use the wave button, tactical pause, and 1x/2x/3x controls to manage the battle.
- Campaign stars unlock later fronts and Armoury purchases. Progress stays on the current device, independently of the original game.

## Build and check

```sh
npm test
npm run lint
npm run build
npm start
```

`dist/` is a standalone static build, suitable for GitHub Pages or another static host. Relative asset paths support hosting in a repository subdirectory. This repository does not deploy or update the original game's Site.

See [validation coverage and playtest notes](docs/VALIDATION.md). Artillery, Air Defense, player tanks, AT Posts, and MG Nests use supplied detailed models; the remaining units are stylized interpretations of military roles. Original terrain artwork and the other UI portraits remain in use.

## Main files

| File | Purpose |
| --- | --- |
| `app/game-client.tsx` | Original simulation, campaign UI, and 3D/audio integration |
| `app/game-data.ts` | Original campaigns, hardware, enemies, and balance data |
| `app/battlefield-3d.ts` | 3D scene, camera, picking, effects, and tactical overlay |
| `app/unit-models.ts` | Shared and batched military unit geometry |
| `app/patriot-model.ts` | Patriot loading, independent instances, and asset cleanup |
| `app/abrams-model.ts` | Abrams materials, turret and gun animation, and asset lifecycle |
| `app/anti-tank-model.ts` | Anti-tank model loading, independent aiming and recoil, and asset lifecycle |
| `app/machine-gun-model.ts` | Machine gun loading, four barrel markers, materials, and asset lifecycle |
| `app/imported-gun-effects.ts` | Shared soft muzzle flash and outdoor reflection helpers |
| `app/missile-flight.ts` | Air-defense missile flight and exhaust visuals |
| `app/battle-audio.ts` | Procedural spatial sound effects and audio lifecycle |
| `app/main.tsx` | Standalone React entry point |

The Auto Turret Machine Gun model is by [NghiaNguyeen](https://sketchfab.com/kiroy2002), under CC BY 4.0. See [model attribution and adaptation details](public/assets/machine-gun/credits.html).

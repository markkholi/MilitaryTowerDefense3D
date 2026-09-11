# MTD3D source provenance

Military Tower Defense 3D is a separate derivative project, created at the owner's request on September 8, 2026.

- Original game: https://military-tower-defense.mkholi23.chatgpt.site/
- Source: the original game's saved source version **15**.
- Source commit: `2f8ad71386a6a3fdf0fcad566405ed727dceb5f8`.
- New repository: https://github.com/markkholi/MilitaryTowerDefense3D

The original source was fetched read-only. Its deployment identity, credentials, and Git remotes were not copied into this project's configuration. No changes were made to the original project or its publication.

The original `app/game-client.tsx` simulation and `app/game-data.ts` campaign definitions are the starting point. All eleven campaigns, the six defense families, eight enemy classes, upgrade doctrines, HQ upgrades, support powers, and endless mode are retained. The original campaign data file is unchanged. Existing terrain artwork and UI portraits are retained in `public/assets`.

MTD3D replaces battlefield sprites with locally generated Three.js meshes and replaces the original per-sound audio routing with a shared spatial mix. The initial artillery pass used the supplied 152mm M-10 Howitzer OBJ as a detailed hero mesh. It has since been replaced by the tracked artillery model described below, with a procedural fallback. Its four supplied texture JPGs are retained alongside the model; the OBJ's absent MTL is intentionally replaced by authored physically based materials. MTD3D uses a standalone React/Vite entry point instead of the original Sites server runtime. Some unused starter components and server template files remain from the original source, but the MTD3D build uses `app/main.tsx` and `vite.config.ts` and requires no server, database, or ChatGPT account.

New unit meshes other than artillery, Air Defense, player tanks, AT Posts, and MG Nests are stylized, authored geometry. They distinguish military roles, but are not exact scale reconstructions of every named historical weapon. The M-10 source OBJ was copied from the separate local MilTowerDefense folder at the owner's request; the original ZIP archive was not redistributed.

## Supplied MIM-104 Patriot model

On September 9, 2026, the owner supplied `mim-104-patriot-air-defense-system.zip`. Its nested source archive contains `MIM-104 Patriot Air Defense System.obj`. MTD3D uses that mesh for the Air Defense family at all upgrade levels; campaign statistics and historical upgrade names remain unchanged.

`scripts/prepare-patriot.mjs` converts the supplied OBJ to `public/assets/patriot/mim-104-patriot.glb`. It retains all 11,612 triangles, indexes and batches them into three meshes, centers the deployed model at ground level, and gives it an 80-unit length. The launcher's upper platform, turntable, hydraulics, and mast rotate together around the modeled mount; four markers identify canister mouths. OBJ texture coordinates are converted to glTF's image orientation.

The supplied `texture_0006.png` and `texture_0011.png` are preserved as `patriot-body.png` and `patriot-wheels.png`. Their weathering and detail are original to the download. Materials use rough painted steel and rubber settings with filtered texture sampling. The third grayscale texture has no material metadata in the supplied archive and is not used as an inferred normal or roughness map. `patriot-portrait.png` is rendered from the converted model for the build menu. No original source archive was modified or included in the repository.

To reproduce the model conversion after extracting the supplied archive:

```sh
node scripts/prepare-patriot.mjs "path/to/MIM-104 Patriot Air Defense System.obj" "path/to/textures"
```

## Supplied M1A2 Woodland Abrams model

On September 9, 2026, the owner supplied `M1A2_Woodland.usdz`. It contains a binary USD scene and thirteen texture JPGs. The converted asset replaces the player Tank family at every upgrade level. Enemy vehicles keep their existing silhouettes; tank damage, movement speed, cost, and historical upgrade names retain the original campaign progression.

The game uses separate hull, turret, and cannon transforms to preserve aiming during redeployment. The cannon recoils along its own axis, and muzzle flash and shot traces originate at the barrel. All instances share the imported geometry and textures; per-tank transforms stay independent. A procedural model remains available while the detailed asset loads or if loading fails. The supplied USDZ is read-only and is not redistributed as an archive.

`scripts/prepare-abrams.mjs` and `scripts/prepare-abrams-textures.py` preserve all 178,871 source triangles in five indexed meshes, neutralize the source turret's baked angle, and set the tank's overall length to 78 game units. The converted files are in `public/assets/abrams/`. Source color JPGs are copied unchanged; normal and scalar maps retain their source resolutions and are stored losslessly after conversion. The converter pairs the flipped texture V coordinate with an inverted tangent-space normal Y channel, and packs roughness/metalness into glTF's green/blue channels. It raises the nearly black tread roughness map into a dry track range and reduces painted armor's metallic factor. The runtime adds a shared soft sky/ground reflection texture. The menu portrait is rendered from this same model.

The model and ten texture files total approximately 25.3 MB before the portrait. Full texture resolution and geometry are retained for close inspection; a new battle initially shows the procedural fallback if the asset is still loading.

Reproduction requires Node.js with the project's Three.js dependency and Python with Pillow:

```sh
node scripts/prepare-abrams.mjs "path/to/M1A2_Woodland.usdz" "path/to/python"
```

## Supplied anti-tank turret model

On September 10, 2026, the owner supplied `anti-tank-turret.zip`. Its nested `source/model.zip` contains a Collada scene and fifteen 2048 × 2048 texture maps. This model replaces the AT Post family at all upgrade levels, with its fixed stabilizer base, independently aiming armored dome, and recoiling cannon. Historical upgrade names and campaign balance remain unchanged.

`scripts/prepare-anti-tank.py` reads the supplied archive without modifying or extracting it. It preserves all 2,870 triangles, source normals and tangent directions, and batches the body panel with the base for three indexed meshes. The 60-unit length fits the battlefield; the collar is the turret's rotation axis, and the shot marker follows the barrel tip. Bounds are approximately 60 × 38.3 × 51.1 game units. The runtime shares geometry and materials among independent instances, filters the supplied surface maps, and provides outdoor reflections and a soft muzzle flash. The build-menu portrait is rendered from this model.

The source color JPGs remain byte-identical. Normal maps preserve their source resolution with a lossless green-channel inversion matching the converted UV/tangent handedness. Occlusion, roughness, and metalness are packed without pixel changes into glTF's red, green, and blue channels. All nine output textures retain 2K resolution. The geometry and textures total approximately 29.4 MB before the portrait. Repeating conversion produced identical output hashes. The supplied ZIP is unchanged and is not redistributed.

Reproduction requires Python with NumPy and Pillow:

```sh
python scripts/prepare-anti-tank.py "path/to/anti-tank-turret.zip"
```

## Supplied Auto Turret Machine Gun

The owner supplied `auto_turret_machine_gun.glb`, whose embedded metadata credits [Auto Turret Machine Gun](https://sketchfab.com/3d-models/auto-turret-machine-gun-1f186169b31d44c7bdf874f97508b340) by [NghiaNguyeen](https://sketchfab.com/kiroy2002), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original credit remains in the GLB and is available through the game's Field manual. The menu portrait is rendered from the adapted model.

`scripts/prepare-machine-gun.mjs` adapts the hierarchy for a grounded, 54-unit-long emplacement with a fixed base, independently aiming upper assembly, and recoiling gun cluster. Four markers are centered on the actual barrel mouths, alternating per shot independently of global effect IDs. The source showcase animation is replaced by live game targeting and short recoil. Existing MG costs, damage, firing cadence, and historical upgrade names are retained.

All 7,556 triangles, normals, tangents, UV channels, materials, and three embedded 4096 × 4096 textures are preserved. The complete source binary payload is byte-identical in the adapted GLB; no resampling, recoloring, or geometry simplification is applied. The runtime supplies filtered texture sampling, shadows, outdoor reflections, and a small muzzle flash. Instances share the asset resources while their aiming, recoil, and active firing point remain independent. The GLB is approximately 31.4 MB; the original file in Downloads is unchanged.

Reproduce the adaptation with Node.js:

```sh
node scripts/prepare-machine-gun.mjs "path/to/auto_turret_machine_gun.glb"
```

## Supplied Artillery military weapon

The owner supplied `artillery_military_weapon.glb`, whose embedded metadata credits [Artillery military weapon](https://sketchfab.com/3d-models/artillery-military-weapon-d6a607960dc84a9dbbaee99a9aaf6b3e) by [Javier Martín Hidalgo](https://sketchfab.com/Jj.Mmhh), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This tracked model replaces the earlier M-10 artillery at all upgrade levels. The source credit remains embedded and is linked from the Field manual. Historical upgrade names and combat balance remain unchanged.

`scripts/prepare-artillery.mjs` groups connected rigid parts by the chassis, upper mount, and main gun. The adapted asset retains all 76,884 triangles, original vertex attributes, five materials, and fifteen embedded 2048 × 2048 texture images. Triangle attribute fingerprints match the supplied model, and image byte hashes are unchanged. Eight indexed meshes provide separate aiming and recoil without dropping source detail. The whole asset is approximately 12.6 MB and 80 game units long.

The tracked chassis stays planted; the complete upper mount aims about its vertical axis. The 5,056-triangle main barrel recoils along its authored 14.73-degree elevation. The muzzle marker is centered on the front bore face, so the flash follows the barrel and shot traces begin at the gun. Outdoor reflection lighting and filtered texture sampling are applied at runtime. The portrait is rendered from the same asset. The original download is unchanged; the earlier M-10 preparation files remain as historical assets but are no longer loaded by the game.

Reproduce the adaptation with Node.js and the project's Three.js dependency:

```sh
node scripts/prepare-artillery.mjs "path/to/artillery_military_weapon.glb"
```

Original assets retain their existing ownership and terms; this repository does not grant a new license to third-party material. Three.js and other libraries retain their respective licenses. New sound effects are synthesized at runtime and contain no downloaded recordings.

## F-16 fighter model (September 11, 2026)

- Source: user-supplied general_dynamics_f-16d_block_60.glb; titled General Dynamics F-16D Block 60.
- Author: [Muhamad Mirza Arrafi](https://sketchfab.com/nazidefenseforceofficial).
- [Original model](https://sketchfab.com/3d-models/general-dynamics-f-16d-block-60-ea8edb08d79e4eafa9c794c581f88cf3), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as recorded in the supplied GLB metadata.
- Public asset: public/assets/fighter/f-16d-block-60.glb. It is byte-identical to the source: SHA-256 0dbf18dfa7b3b2bf91a0bd1ced45beb158247da165850e611718776c8f1fc9d6. All 61,543 triangles, 22 meshes, 18 materials and 18 embedded textures are retained, including the authored landing gear pose.
- Runtime adaptation centers the aircraft, rotates its nose to +X, and scales its length to 52 game units. Shared environment lighting and anisotropic filtering complement the supplied materials; transparent canopy materials do not write depth.
- Interceptor, multirole and strike sorties share geometry/materials with independent flight transforms. Gunships and enemy bombers keep their existing models. No combat statistics changed.
- The flight-line portrait is rendered from this asset. Credit is linked from the Field manual at public/assets/fighter/credits.html.

## Enemy soldier model (September 11, 2026)

- User-supplied scifi_soldier_character_low-poly.glb, titled SciFi Soldier Character Low-poly.
- Author: [Polly Hermiston](https://sketchfab.com/Polly_Hermiston).
- [Original model](https://sketchfab.com/3d-models/scifi-soldier-character-low-poly-6c53691fa07e46aca890c771940b3651), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), per the supplied asset metadata.
- public/assets/soldier/scifi-soldier.glb is byte-identical to the source: SHA-256 ccae12e537f0069c72e11bbb9b18c1424c471767557a9a457006267613ee097e. Three meshes/materials, 33,792 triangles and all three embedded textures are retained.
- The source has no skeleton or animation clips. Runtime adaptation normalizes height to 28 units and forward to +X, adds five bones with blended leg weights, and leaves rifle vertices attached to the upper body. Each enemy owns its skeleton; geometry, materials and textures are shared. Walking follows traveled distance, stops while stationary and freezes on pause.
- Material tuning reduces the source's default fully metallic response for painted armor and fabric; environment lighting and anisotropic filtering preserve visible surface detail.
- Infantry, swarmlings, slingers and brutes use this asset. Brutes retain 1.25 scale and swarmlings .8 scale. Combat behavior, health, weapons and rewards are unchanged.
- The portrait is rendered from the model. Credit is linked from the Field manual at public/assets/soldier/credits.html.

## Enemy Gurkha truck (September 11, 2026)

- User-supplied terradyne_gurkha_military_truck_game_model.glb, titled Terradyne Gurkha Military Truck Game Model.
- Author: [Heber Soto](https://sketchfab.com/hebsoto).
- [Original model](https://sketchfab.com/3d-models/terradyne-gurkha-military-truck-game-model-7e2d38b2002741c383ea2009e3f8f76a), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), per supplied metadata.
- public/assets/truck/gurkha.glb retains every source byte: SHA-256 1d6b1bd90ef06a390b647dc547f993f617366f33edde181938170e4159352960. It contains 38,856 triangles, 25 meshes, 16 materials and 46 embedded images.
- Runtime adaptation normalizes length to 44 game units, seats tires on the road, points the nose along +X and adds axle pivots to the four existing wheel assemblies. Rotation follows traveled distance divided by wheel radius. Each instance owns its transforms and shares geometry/materials/textures.
- Existing PBR maps are retained with anisotropic filtering and environment lighting. Only enemy Scouts change model; tracked Bulwarks and Siege Columns retain theirs. No combat statistics changed.
- The portrait is rendered from the asset. Credit is linked from the Field manual at public/assets/truck/credits.html.

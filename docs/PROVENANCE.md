# MTD3D source provenance

Military Tower Defense 3D is a separate derivative project, created at the owner's request on September 8, 2026.

- Original game: https://military-tower-defense.mkholi23.chatgpt.site/
- Source: the original game's saved source version **15**.
- Source commit: `2f8ad71386a6a3fdf0fcad566405ed727dceb5f8`.
- New repository: https://github.com/markkholi/MilitaryTowerDefense3D

The original source was fetched read-only. Its deployment identity, credentials, and Git remotes were not copied into this project's configuration. No changes were made to the original project or its publication.

The original `app/game-client.tsx` simulation and `app/game-data.ts` campaign definitions are the starting point. All eleven campaigns, the six defense families, eight enemy classes, upgrade doctrines, HQ upgrades, support powers, and endless mode are retained. The original campaign data file is unchanged. Existing terrain artwork and UI portraits are retained in `public/assets`.

MTD3D replaces battlefield sprites with locally generated Three.js meshes and replaces the original per-sound audio routing with a shared spatial mix. Artillery additionally uses the supplied 152mm M-10 Howitzer OBJ as a detailed hero mesh, with a procedural fallback. Its four supplied texture JPGs are retained alongside the model; the OBJ's absent MTL is intentionally replaced by authored physically based materials. MTD3D uses a standalone React/Vite entry point instead of the original Sites server runtime. Some unused starter components and server template files remain from the original source, but the MTD3D build uses `app/main.tsx` and `vite.config.ts` and requires no server, database, or ChatGPT account.

New unit meshes other than artillery, Air Defense, player tanks, and AT Posts are stylized, authored geometry. They distinguish military roles, but are not exact scale reconstructions of every named historical weapon. The M-10 source OBJ was copied from the separate local MilTowerDefense folder at the owner's request; the original ZIP archive was not redistributed.

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

Original assets retain their existing ownership and terms; this repository does not grant a new license to third-party material. Three.js and other libraries retain their respective licenses. New sound effects are synthesized at runtime and contain no downloaded recordings.

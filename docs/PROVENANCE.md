# MTD3D source provenance

Military Tower Defense 3D is a separate derivative project, created at the owner's request on September 8, 2026.

- Original game: https://military-tower-defense.mkholi23.chatgpt.site/
- Source: the original game's saved source version **15**.
- Source commit: `2f8ad71386a6a3fdf0fcad566405ed727dceb5f8`.
- New repository: https://github.com/markkholi/MilitaryTowerDefense3D

The original source was fetched read-only. Its deployment identity, credentials, and Git remotes were not copied into this project's configuration. No changes were made to the original project or its publication.

The original `app/game-client.tsx` simulation and `app/game-data.ts` campaign definitions are the starting point. All eleven campaigns, the six defense families, eight enemy classes, upgrade doctrines, HQ upgrades, support powers, and endless mode are retained. The original campaign data file is unchanged. Existing terrain artwork and UI portraits are retained in `public/assets`.

MTD3D replaces battlefield sprites with locally generated Three.js meshes and replaces the original per-sound audio routing with a shared spatial mix. Artillery additionally uses the supplied 152mm M-10 Howitzer OBJ as a detailed hero mesh, with a procedural fallback. Its four supplied texture JPGs are retained alongside the model; the OBJ's absent MTL is intentionally replaced by authored physically based materials. MTD3D uses a standalone React/Vite entry point instead of the original Sites server runtime. Some unused starter components and server template files remain from the original source, but the MTD3D build uses `app/main.tsx` and `vite.config.ts` and requires no server, database, or ChatGPT account.

New unit meshes other than artillery and Air Defense are stylized, authored geometry. They distinguish military roles, but are not exact scale reconstructions of every named historical weapon. The M-10 source OBJ was copied from the separate local MilTowerDefense folder at the owner's request; the original ZIP archive was not redistributed.

## Supplied MIM-104 Patriot model

On September 9, 2026, the owner supplied `mim-104-patriot-air-defense-system.zip`. Its nested source archive contains `MIM-104 Patriot Air Defense System.obj`. MTD3D uses that mesh for the Air Defense family at all upgrade levels; campaign statistics and historical upgrade names remain unchanged.

`scripts/prepare-patriot.mjs` converts the supplied OBJ to `public/assets/patriot/mim-104-patriot.glb`. It retains all 11,612 triangles, indexes and batches them into three meshes, centers the deployed model at ground level, and gives it an 80-unit length. The launcher's upper platform, turntable, hydraulics, and mast rotate together around the modeled mount; four markers identify canister mouths. OBJ texture coordinates are converted to glTF's image orientation.

The supplied `texture_0006.png` and `texture_0011.png` are preserved as `patriot-body.png` and `patriot-wheels.png`. Their weathering and detail are original to the download. Materials use rough painted steel and rubber settings with filtered texture sampling. The third grayscale texture has no material metadata in the supplied archive and is not used as an inferred normal or roughness map. `patriot-portrait.png` is rendered from the converted model for the build menu. No original source archive was modified or included in the repository.

To reproduce the model conversion after extracting the supplied archive:

```sh
node scripts/prepare-patriot.mjs "path/to/MIM-104 Patriot Air Defense System.obj" "path/to/textures"
```

Original assets retain their existing ownership and terms; this repository does not grant a new license to third-party material. Three.js and other libraries retain their respective licenses. New sound effects are synthesized at runtime and contain no downloaded recordings.

# MTD3D source provenance

Military Tower Defense 3D is a separate derivative project, created at the owner's request on September 8, 2026.

- Original game: https://military-tower-defense.mkholi23.chatgpt.site/
- Source: the original game's saved source version **15**.
- Source commit: `2f8ad71386a6a3fdf0fcad566405ed727dceb5f8`.
- New repository: https://github.com/markkholi/MilitaryTowerDefense3D

The original source was fetched read-only. Its deployment identity, credentials, and Git remotes were not copied into this project's configuration. No changes were made to the original project or its publication.

The original `app/game-client.tsx` simulation and `app/game-data.ts` campaign definitions are the starting point. All eleven campaigns, the six defense families, eight enemy classes, upgrade doctrines, HQ upgrades, support powers, and endless mode are retained. The original campaign data file is unchanged. Existing terrain artwork and UI portraits are retained in `public/assets`.

MTD3D replaces battlefield sprites with locally generated Three.js meshes and replaces the original per-sound audio routing with a shared spatial mix. It uses a standalone React/Vite entry point instead of the original Sites server runtime. Some unused starter components and server template files remain from the original source, but the MTD3D build uses `app/main.tsx` and `vite.config.ts` and requires no server, database, or ChatGPT account.

New unit meshes are stylized, authored geometry. They distinguish military roles, but are not exact scale reconstructions of every named historical weapon. The three model ZIP files in the separate local MilTowerDefense folder were not imported or redistributed.

Original assets retain their existing ownership and terms; this repository does not grant a new license to third-party material. Three.js and other libraries retain their respective licenses. New sound effects are synthesized at runtime and contain no downloaded recordings.

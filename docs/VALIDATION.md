# Validation

Run `npm test`, `npm run lint`, and `npm run build` from the repository root.

The automated checks cover:

- Valid wave generation and enemy statistics across all eleven campaigns and 100 additional waves per campaign.
- Finite, volumetric geometry for all defense, enemy, aircraft, and HQ models at multiple upgrade levels.
- Independent turret and muzzle animation across cloned units, plus bounded mesh counts after batching.
- The actual Patriot GLB: finite indexed geometry, deployed bounds, packaged texture atlases, corrected wheel UV orientation, independent launcher aiming, upgrades, elevated picking, fallback loading, and cleanup after a late load.
- Patriot missile departure direction, arrival position, exhaust fade, and delayed aerial impact visuals.
- The actual Abrams GLB and its PBR texture references; independent hull/turret/gun transforms, authored barrel rest position, recoil, muzzle-origin traces, road placement, redeployment transforms, retained heading after upgrades, picking, fallback loading, and resource cleanup.
- The actual anti-tank GLB: all 2,870 source triangles, finite normals/tangents and UVs, full material bindings, fixed chassis during aiming, independent recoil, muzzle-origin firing, off-road placement, upgrades, elevated picking, fallback loading, and resource cleanup.
- Ground-coordinate picking after camera rotation, zoom, reset, and tilt; selection of elevated models; rejection of off-board clicks.
- Isolated MTD3D progress and the absence of the original deployment identity.
- Audible finite output from all eleven sound classes, launch-position stereo balance, individual-effect headroom, live muting, volume zero, and release of audio sources.

Audio tests use an offline Web Audio implementation. Its compressor is a passthrough, so they test individual-effect headroom and routing rather than native-browser limiter behavior. They produce `outputs/mtd3d-effects-preview.wav` for listening. That output is not committed.

The production build is type-checked and includes local copies of all artwork. The development server has been checked over HTTP. The September 9 Patriot pass was also inspected in the browser: close-up textures, chassis/launcher rotation, missile departure, and placement, selection, upgrading, and camera zoom in Verdun. Tests exercise targeting transforms and loading failures separately. No full-campaign performance benchmark or new subjective audio assessment was performed for this model change.

The Abrams pass was inspected in a close-up browser scene for woodland materials, hull/turret independence, recoil, and the soft muzzle flash. The game was checked in Verdun for tank road placement, selection, upgrading, completed redeployment, and camera zoom. After redeploying, the tank engaged enemies and registered seven kills; the browser reported no errors. That pass had 22 passing tests. The model retains the source geometry and texture resolution; no many-tank GPU benchmark has been performed.

The September 10 anti-tank pass has 28 passing tests, with lint and the production build also passing. Close-up browser inspection verified source surface detail, collar-centered turret rotation, recoil, and muzzle flash. In Verdun, the AT Post was placed off-road, upgraded to tier II, and selected again through its elevated mesh after camera rotation and zoom. It registered 45 kills by wave four with the HQ still at 20/20; no game-page browser errors were reported. The converted asset and portrait load locally. Texture packing, source preservation, and repeatable conversion hashes were verified separately. No many-unit GPU benchmark was performed. Temporary conversion directories are excluded from the development watcher after a Windows/OneDrive archive lock caused a server exit during extraction.

Suggested playtest: deploy to Verdun; place an MG off the road and a tank on it; rotate/tilt/zoom; select and upgrade both; deploy a wave; check targeting, sounds, pause, speed, and return to the campaign. Later fronts exercise aircraft, multi-lane traffic, and HQ defenses. Verify volume and campaign progress persist across reloads.

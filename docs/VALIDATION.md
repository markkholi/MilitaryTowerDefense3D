# Validation

Run `npm test`, `npm run lint`, and `npm run build` from the repository root.

The automated checks cover:

- Valid wave generation and enemy statistics across all eleven campaigns and 100 additional waves per campaign.
- Finite, volumetric geometry for all defense, enemy, aircraft, and HQ models at multiple upgrade levels.
- Independent turret and muzzle animation across cloned units, plus bounded mesh counts after batching.
- The actual Patriot GLB: finite indexed geometry, deployed bounds, packaged texture atlases, corrected wheel UV orientation, independent launcher aiming, upgrades, elevated picking, fallback loading, and cleanup after a late load.
- Patriot missile departure direction, arrival position, exhaust fade, and delayed aerial impact visuals.
- Ground-coordinate picking after camera rotation, zoom, reset, and tilt; selection of elevated models; rejection of off-board clicks.
- Isolated MTD3D progress and the absence of the original deployment identity.
- Audible finite output from all eleven sound classes, launch-position stereo balance, individual-effect headroom, live muting, volume zero, and release of audio sources.

Audio tests use an offline Web Audio implementation. Its compressor is a passthrough, so they test individual-effect headroom and routing rather than native-browser limiter behavior. They produce `outputs/mtd3d-effects-preview.wav` for listening. That output is not committed.

The production build is type-checked and includes local copies of all artwork. The development server has been checked over HTTP. The September 9 Patriot pass was also inspected in the browser: close-up textures, chassis/launcher rotation, missile departure, and placement, selection, upgrading, and camera zoom in Verdun. Tests exercise targeting transforms and loading failures separately. No full-campaign performance benchmark or new subjective audio assessment was performed for this model change.

Suggested playtest: deploy to Verdun; place an MG off the road and a tank on it; rotate/tilt/zoom; select and upgrade both; deploy a wave; check targeting, sounds, pause, speed, and return to the campaign. Later fronts exercise aircraft, multi-lane traffic, and HQ defenses. Verify volume and campaign progress persist across reloads.

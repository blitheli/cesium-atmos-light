# Agent Guide

## Project goal

Render a close ISS view in Cesium 1.140 with Bruneton LUT atmosphere, visible Earth day/night lighting, and ISS self-shadowing. The approved design is:

- `docs/superpowers/specs/2026-08-13-cesium-bruneton-atmosphere-design.md`
- `docs/superpowers/plans/2026-08-13-cesium-bruneton-atmosphere.md`

Read the design before changing rendering code. The 2026-08-13 revision overrides older linear-HDR and `fromLightSource: false` snippets.

## Commands

```text
npm test
npm run build
npm run dev
```

Targeted rendering regression test:

```text
npx vitest run src/renderPipeline.test.ts
```

## Important files

- `src/cesium/createViewer.ts`: Viewer, HDR, globe lighting, resolution.
- `src/iss/issShadowCamera.ts`: ISS-local orthographic solar shadow map.
- `src/atmosphere/bruneton/AtmospherePostProcess.ts`: Bruneton sky pass.
- `src/atmosphere/bruneton/AerialPerspectiveEffect.ts`: aerial stage setup.
- `src/atmosphere/bruneton/shaders/aerialPerspectiveEffect.frag`: finite-depth atmospheric composite.
- `src/atmosphere/bruneton/enableBrunetonAtmosphere.ts`: LUT lifecycle, native fallback, mode switching.
- `src/App.tsx`: scene assembly and visual controls.

## Rendering invariants

1. Keep the default Cesium `SunLight`; read direction from `uniformState.sunDirectionWC`. Do not calculate a second solar ephemeris.
2. `scene.shadowMap` must use `fromLightSource: true`. With `false`, Cesium renders a shadow texture but excludes it from `lightShadowMaps`, so Models do not receive shadows.
3. Keep the ISS shadow camera centered on ISS: half-width 120 m, eye distance 400 m, near 1 m, far 800 m.
4. Keep globe lighting fade at `0 → 1 m`. Cesium defaults fade day/night lighting out at near-Earth distances, making the 408 km view appear fully lit.
5. Cesium 1.140 runs its built-in PBR Neutral tonemapper before user `PostProcessStage`s. Custom atmosphere stages therefore receive display-referred color:
   - Sky radiance must be mapped with `czm_pbrNeutralTonemapping` and `czm_inverseGamma`.
   - Aerial perspective must decode Cesium's gamma-encoded tonemapper output with `pow(..., czm_gamma)` (PostProcessStage has no `HDR` define, so `czm_gammaCorrect` is a no-op), apply transmittance in display-linear space, display-map new inscatter, then encode once.
   - Do not reintroduce ACES or directly add linear Bruneton radiance to the tonemapped scene.
6. Keep stage order: sky first, aerial perspective second.
7. Keep all cloud-shadow, shadow-length, and Tyndall inputs disabled and bound to the dummy texture unless the project scope explicitly adds those systems.
8. Preserve native atmosphere fallback when WebGL2, LUT loading, or stage initialization fails.

## Visual verification

Automated tests do not validate WebGL output. After rendering changes, compare:

1. Bruneton vs native: the globe disk and atmospheric limb should visibly differ.
2. Shadows on vs off: ISS structural self-shadows must visibly change.
3. Noon vs evening/terminator: Earth surface illumination must visibly change.
4. Confirm no shader errors, black frame, or missing ISS after switching modes repeatedly.

The target reference is `public/atmos.png` when available. Exact takram `Atmosphere-LightingMask` parity is not currently promised: Cesium IBL still uses its native environment map, but direct solar self-shadowing must work.

## Change discipline

- Add or update a failing regression test before fixing rendering behavior when the behavior can be tested without WebGL.
- Run the full test suite and production build after substantive changes.
- Do not edit Cesium under `node_modules`.
- Do not commit generated `dist/`, Vite cache files, or test result files.
- Do not commit or push unless the user explicitly requests it.

## Cursor Cloud specific instructions

Cloud agents should use `.cursor/environment.json`. `install` runs `npm ci`; the Vite terminal serves the app at `http://127.0.0.1:5173`. `VITE_CESIUM_ION_TOKEN` is optional: without it the globe uses Cesium's built-in NaturalEarthII imagery. Automated tests do not need WebGL; browser checks of the ISS scene do.

import { describe, expect, it } from "vitest";
import skyStageSource from "./atmosphere/bruneton/AtmospherePostProcess.ts?raw";
import aerialSource from "./atmosphere/bruneton/shaders/aerialPerspectiveEffect.frag?raw";
import enableSource from "./atmosphere/bruneton/enableBrunetonAtmosphere.ts?raw";
import viewerSource from "./cesium/createViewer.ts?raw";
import shadowCameraSource from "./iss/issShadowCamera.ts?raw";
import controlPanelSource from "./ui/ControlPanel.tsx?raw";
import appSource from "./App.tsx?raw";

describe("render pipeline integration", () => {
  it("does not load the ISS model or ISS shadow camera", () => {
    expect(appSource).not.toContain("addIssEntity");
    expect(appSource).not.toContain("bindIssShadowCamera");
  });

  it("keeps the camera looking at the ISS slot without loading the model", () => {
    expect(appSource).toContain("issPosition()");
    expect(appSource).toContain("lookAt");
  });

  it("registers the ISS shadow map as a light source", () => {
    expect(shadowCameraSource).toContain("fromLightSource: true");
  });

  it("keeps globe day-night lighting enabled at ISS altitude", () => {
    expect(viewerSource).toContain(
      "viewer.scene.globe.lightingFadeOutDistance = 0",
    );
    expect(viewerSource).toContain(
      "viewer.scene.globe.lightingFadeInDistance = 1",
    );
  });

  it("disables globe shadow receive so the ISS-local map cannot black out Earth", () => {
    expect(viewerSource).toContain(
      "viewer.scene.globe.shadows = Cesium.ShadowMode.DISABLED",
    );
  });

  it("shows the native Cesium timeline", () => {
    expect(viewerSource).toMatch(/timeline:\s*true/);
  });

  it("exposes a globe lighting toggle for native atmosphere only", () => {
    expect(controlPanelSource).toContain("光照");
    expect(controlPanelSource).toContain("onLighting");
    expect(appSource).toContain("globe.enableLighting");
    expect(controlPanelSource).not.toContain("ISS 显示");
    expect(controlPanelSource).not.toMatch(/阴影/);
  });

  it("turns off Cesium globe lighting while Bruneton is enabled", () => {
    expect(enableSource).toContain("globe.enableLighting = showNative");
    expect(enableSource).toContain("applyNativeAtmosphere(false)");
  });

  it("lights globe albedo with Bruneton sun and sky irradiance", () => {
    expect(aerialSource).toContain("GetSunAndSkyIrradiance");
    expect(aerialSource).toContain("RECIPROCAL_PI");
    expect(aerialSource).toContain("normalize(scenePosKm)");
  });

  it("composites aerial perspective in display space with exposure", () => {
    expect(aerialSource).toContain("uniform float u_atmosphereExposure;");
    // PostProcessStage does not define HDR, so czm_gammaCorrect is a no-op —
    // decode Cesium's gamma-encoded tonemapper output explicitly.
    expect(aerialSource).toContain(
      "pow(max(originalColor.rgb, vec3(0.0)), vec3(czm_gamma))",
    );
    expect(aerialSource).toContain(
      "czm_pbrNeutralTonemapping(hdr * u_atmosphereExposure)",
    );
  });

  it("display-maps Bruneton sky after Cesium tonemapping", () => {
    expect(skyStageSource).toContain(
      "czm_inverseGamma(czm_pbrNeutralTonemapping(linearColor))",
    );
  });

  it("does not override Bruneton sky with a debug color", () => {
    expect(skyStageSource).not.toContain("finalColor = vec3(1.0, 0.0, 0.0)");
  });
});

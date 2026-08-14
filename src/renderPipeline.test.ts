import { describe, expect, it } from "vitest";
import skyStageSource from "./atmosphere/bruneton/AtmospherePostProcess.ts?raw";
import aerialSource from "./atmosphere/bruneton/shaders/aerialPerspectiveEffect.frag?raw";
import viewerSource from "./cesium/createViewer.ts?raw";
import shadowCameraSource from "./iss/issShadowCamera.ts?raw";
import controlPanelSource from "./ui/ControlPanel.tsx?raw";
import appSource from "./App.tsx?raw";

describe("render pipeline integration", () => {
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

  it("exposes a globe lighting toggle in the control panel", () => {
    expect(controlPanelSource).toContain("光照");
    expect(controlPanelSource).toContain("onLighting");
    expect(appSource).toContain("globe.enableLighting");
  });

  it("composites aerial perspective in display space with exposure", () => {
    expect(aerialSource).toContain("uniform float u_atmosphereExposure;");
    // PostProcessStage does not define HDR, so czm_gammaCorrect is a no-op —
    // decode Cesium's gamma-encoded tonemapper output explicitly.
    expect(aerialSource).toContain(
      "pow(max(originalColor.rgb, vec3(0.0)), vec3(czm_gamma))",
    );
    expect(aerialSource).toContain(
      "czm_pbrNeutralTonemapping(inscatter * u_atmosphereExposure)",
    );
  });

  it("display-maps Bruneton sky after Cesium tonemapping", () => {
    expect(skyStageSource).toContain(
      "czm_inverseGamma(czm_pbrNeutralTonemapping(linearColor))",
    );
  });
});

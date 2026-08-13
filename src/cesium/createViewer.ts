import * as Cesium from "cesium";
import { julianDateForScene } from "./julianDate";
import "cesium/Build/Cesium/Widgets/widgets.css";

export function createViewer(options: {
  container: HTMLElement;
  ionToken?: string;
}): Cesium.Viewer {
  const token = options.ionToken ?? import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  } else {
    console.warn("No VITE_CESIUM_ION_TOKEN; using built-in NaturalEarthII");
  }

  const viewerOptions: Cesium.Viewer.ConstructorOptions = {
    skyBox: false,
    shadows: true,
    shouldAnimate: false,
    animation: true,
    timeline: true,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    msaaSamples: 4,
    requestRenderMode: false,
    useBrowserRecommendedResolution: false,
  };

  if (!token) {
    viewerOptions.baseLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
      ),
    );
  }

  const viewer = new Cesium.Viewer(options.container, viewerOptions);
  const sceneTime = julianDateForScene();
  viewer.clock.currentTime = sceneTime;
  viewer.clock.startTime = Cesium.JulianDate.addHours(
    sceneTime,
    -12,
    new Cesium.JulianDate(),
  );
  viewer.clock.stopTime = Cesium.JulianDate.addHours(
    sceneTime,
    12,
    new Cesium.JulianDate(),
  );
  viewer.clock.multiplier = 1;
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.shouldAnimate = false;
  viewer.timeline?.zoomTo(viewer.clock.startTime, viewer.clock.stopTime);
  viewer.resolutionScale = window.devicePixelRatio;
  viewer.scene.globe.enableLighting = true;
  // Cesium fades day/night shading out below roughly 10,000 km by default.
  // Keep it active for the 408 km ISS camera without introducing a zero-width fade.
  viewer.scene.globe.lightingFadeOutDistance = 0;
  viewer.scene.globe.lightingFadeInDistance = 1;
  viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
  // ISS shadow map is a ~240 m ortho volume; ECEF float precision makes distant
  // globe samples look shadowed. Keep self-shadowing on the ISS model only.
  viewer.scene.globe.shadows = Cesium.ShadowMode.DISABLED;
  viewer.scene.highDynamicRange = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true;
  }
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.fog.enabled = false;
  return viewer;
}

export function destroyViewer(viewer: Cesium.Viewer): void {
  viewer.destroy();
}

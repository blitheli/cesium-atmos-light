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
    animation: false,
    timeline: false,
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
  viewer.clock.currentTime = julianDateForScene();
  viewer.clock.shouldAnimate = false;
  viewer.resolutionScale = window.devicePixelRatio;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.highDynamicRange = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.fog.enabled = false;
  return viewer;
}

export function destroyViewer(viewer: Cesium.Viewer): void {
  viewer.destroy();
}

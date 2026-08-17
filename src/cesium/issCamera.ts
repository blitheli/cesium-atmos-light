import * as Cesium from "cesium";
import { issPosition } from "../config/scene";
import type { ViewPreset } from "../config/presets";

export const ISS_MIN_RANGE_M = 40;
export const ISS_MAX_RANGE_M = 8000;

export function scaleIssCameraRange(rangeM: number, wheelDeltaY: number): number {
  const next = rangeM * Math.exp(wheelDeltaY * 0.0015);
  return Math.min(ISS_MAX_RANGE_M, Math.max(ISS_MIN_RANGE_M, next));
}

export function setIssCameraRange(
  camera: { position: Cesium.Cartesian3 },
  rangeM: number,
): void {
  const mag = Cesium.Cartesian3.magnitude(camera.position);
  if (mag < 1e-3) return;
  Cesium.Cartesian3.multiplyByScalar(camera.position, rangeM / mag, camera.position);
}

export function configureIssOrbitControls(viewer: Cesium.Viewer): void {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableRotate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableTranslate = false;
  controller.enableLook = false;
  controller.enableCollisionDetection = false;
  controller.minimumZoomDistance = ISS_MIN_RANGE_M;
  controller.maximumZoomDistance = ISS_MAX_RANGE_M;
  // Cesium's globe-relative wheel zoom is a no-op (or sub-meter) in ISS lookAt
  // space. Range is changed by bindIssWheelZoom instead.
  controller.zoomEventTypes = [Cesium.CameraEventType.PINCH];
}

export function applyViewPreset(viewer: Cesium.Viewer, preset: ViewPreset): void {
  viewer.trackedEntity = undefined;
  viewer.camera.lookAt(
    issPosition(),
    new Cesium.HeadingPitchRange(
      preset.headingRad,
      preset.pitchRad,
      preset.rangeM,
    ),
  );
}

export function ensureIssLookAt(camera: Cesium.Camera): void {
  if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) {
    return;
  }
  const target = issPosition();
  const range = Cesium.Cartesian3.distance(camera.positionWC, target);
  camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(camera.heading, camera.pitch, range),
  );
}

export function bindIssWheelZoom(viewer: Cesium.Viewer): () => void {
  const canvas = viewer.scene.canvas;
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    ensureIssLookAt(viewer.camera);
    const current = Cesium.Cartesian3.magnitude(viewer.camera.position);
    setIssCameraRange(viewer.camera, scaleIssCameraRange(current, event.deltaY));
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => canvas.removeEventListener("wheel", onWheel);
}

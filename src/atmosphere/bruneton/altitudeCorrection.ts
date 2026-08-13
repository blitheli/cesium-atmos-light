import * as Cesium from "cesium";

export function computeAltitudeCorrectionKm(
  viewer: Cesium.Viewer,
  bottomRadiusMeters: number,
): Cesium.Cartesian3 {
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const cameraPos = viewer.camera.positionWC;
  const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
  if (!carto) return new Cesium.Cartesian3(0, 0, 0);
  const surface = Cesium.Cartesian3.fromRadians(
    carto.longitude,
    carto.latitude,
    0,
    ellipsoid,
  );
  const normal = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
  const center = Cesium.Cartesian3.subtract(
    surface,
    Cesium.Cartesian3.multiplyByScalar(
      normal,
      bottomRadiusMeters,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const offsetMeters = Cesium.Cartesian3.negate(center, new Cesium.Cartesian3());
  return new Cesium.Cartesian3(
    offsetMeters.x * 0.001,
    offsetMeters.y * 0.001,
    offsetMeters.z * 0.001,
  );
}

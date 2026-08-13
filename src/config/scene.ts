import { Cartesian3, Math as CesiumMath } from "cesium";

export const ISS_LONGITUDE = -110;
export const ISS_LATITUDE = 45;
export const ISS_HEIGHT_M = 408000;
export const SCENE_YEAR = 2026;
export const DAY_OF_YEAR = 150;
export const LOCAL_SOLAR_HOUR = 17;
export const CAMERA_RANGE_M = 250;
export const CAMERA_HEADING_RAD = CesiumMath.toRadians(40);
export const CAMERA_PITCH_RAD = CesiumMath.toRadians(-25);
export const CAMERA_ROLL_RAD = 0;

export function issPosition(): Cartesian3 {
  return Cartesian3.fromDegrees(ISS_LONGITUDE, ISS_LATITUDE, ISS_HEIGHT_M);
}

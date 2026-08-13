import * as Cesium from "cesium";
import { getSceneContext } from "./engineApi";

const last = new Cesium.Cartesian3(1, 0, 0);

export function getSunDirectionWc(viewer: Cesium.Viewer): Cesium.Cartesian3 {
  const dir = getSceneContext(viewer.scene).uniformState.sunDirectionWC;
  if (!dir || Cesium.Cartesian3.equalsEpsilon(dir, Cesium.Cartesian3.ZERO, 0, 1e-12)) {
    return Cesium.Cartesian3.clone(last);
  }
  Cesium.Cartesian3.clone(dir, last);
  return Cesium.Cartesian3.clone(dir);
}

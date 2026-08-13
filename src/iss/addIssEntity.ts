import * as Cesium from "cesium";
import { issPosition } from "../config/scene";

export function addIssEntity(viewer: Cesium.Viewer): Cesium.Entity {
  const position = issPosition();
  return viewer.entities.add({
    name: "ISS",
    position,
    orientation: Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(0, 0, 0),
    ),
    model: {
      uri: "/iss-cesium.glb",
      shadows: Cesium.ShadowMode.ENABLED,
      heightReference: Cesium.HeightReference.NONE,
      incrementallyLoadTextures: false,
    },
  });
}

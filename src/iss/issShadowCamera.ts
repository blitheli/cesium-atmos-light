import * as Cesium from "cesium";
import { getSunDirectionWc } from "../cesium/sunDirection";
import { Engine, getSceneContext } from "../cesium/engineApi";

const HALF = 120;
const EYE_DIST = 400;

export function bindIssShadowCamera(
  viewer: Cesium.Viewer,
  target: Cesium.Cartesian3,
): () => void {
  const scene = viewer.scene;
  const lightCamera = new Cesium.Camera(scene);
  const frustum = new Cesium.OrthographicOffCenterFrustum();
  frustum.near = 1;
  frustum.far = 800;
  frustum.left = -HALF;
  frustum.right = HALF;
  frustum.top = HALF;
  frustum.bottom = -HALF;
  (lightCamera as { frustum: Cesium.OrthographicOffCenterFrustum }).frustum = frustum;

  scene.shadowMap = new Engine.ShadowMap({
    context: getSceneContext(scene),
    lightCamera,
    enabled: true,
    isPointLight: false,
    cascadesEnabled: false,
    size: 2048,
    fromLightSource: true,
    darkness: 0.2,
    fadingEnabled: false,
  });

  const remove = scene.preRender.addEventListener(() => {
    const s = getSunDirectionWc(viewer);
    const eye = Cesium.Cartesian3.add(
      target,
      Cesium.Cartesian3.multiplyByScalar(s, EYE_DIST, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const direction = Cesium.Cartesian3.negate(s, new Cesium.Cartesian3());
    let up = Cesium.Cartesian3.normalize(target, new Cesium.Cartesian3());
    const aligned = Math.abs(Cesium.Cartesian3.dot(up, direction));
    if (aligned > 0.99) {
      up = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z);
    }
    lightCamera.setView({
      destination: eye,
      orientation: { direction, up },
    });
  });

  return () => {
    remove();
  };
}

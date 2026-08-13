import * as Cesium from "cesium";
import { AtmosphereParameters } from "./AtmosphereParameters";
import {
  loadPrecomputedTextures,
  type BrunetonTextures,
} from "./PrecomputedTexturesLoader";
import { AtmospherePostProcess } from "./AtmospherePostProcess";
import { AerialPerspectiveEffect } from "./AerialPerspectiveEffect";
import { makeDummyTexture } from "./dummyTexture";
import { getSceneContext } from "../../cesium/engineApi";

export interface BrunetonAtmosphereOptions {
  assetsBaseUrl?: string;
  exposure?: number;
}

export interface BrunetonAtmosphereHandle {
  setEnabled(enabled: boolean): void;
  setExposure(exposure: number): void;
  destroy(): void;
}

export async function enableBrunetonAtmosphere(
  viewer: Cesium.Viewer,
  options?: BrunetonAtmosphereOptions,
): Promise<BrunetonAtmosphereHandle> {
  const context = getSceneContext(viewer.scene);
  if (!context.webgl2) {
    throw new Error("WebGL2 required for Bruneton atmosphere");
  }

  const assetsBaseUrl = options?.assetsBaseUrl ?? "/atmosphere/";
  const exposure = options?.exposure ?? 1.0;
  const atmosphereParams = new AtmosphereParameters();
  const dummy = makeDummyTexture(context);
  const textures: BrunetonTextures = await loadPrecomputedTextures(
    assetsBaseUrl,
    context,
  );

  const sky = new AtmospherePostProcess(viewer, {
    atmosphereParams,
    textures,
    dummyTexture: dummy,
    exposure,
    applyGroundAtmosphere: false,
    autoAddStage: false,
  });
  const aerial = new AerialPerspectiveEffect(viewer, {
    atmosphereParams,
    textures,
    dummyTexture: dummy,
    exposure,
    autoAddStage: false,
  });

  try {
    await sky.init();
    await aerial.init();
  } catch (err) {
    dummy.destroy();
    destroyTextures(textures);
    throw err;
  }

  if (!sky.stage || !aerial.stage) {
    dummy.destroy();
    destroyTextures(textures);
    throw new Error("Bruneton post-process stages failed to compile");
  }

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = false;
  }
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.fog.enabled = false;
  if (viewer.scene.sun) {
    viewer.scene.sun.show = false;
  }
  viewer.scene.postProcessStages.add(sky.stage);
  viewer.scene.postProcessStages.add(aerial.stage);

  const applyNativeAtmosphere = (showNative: boolean) => {
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = showNative;
    }
    viewer.scene.globe.showGroundAtmosphere = showNative;
    if (viewer.scene.sun) {
      viewer.scene.sun.show = showNative;
    }
  };

  return {
    setEnabled(next: boolean) {
      if (!sky.stage || !aerial.stage) return;
      sky.stage.enabled = next;
      aerial.stage.enabled = next;
      applyNativeAtmosphere(!next);
    },
    setExposure(next: number) {
      sky.setExposure(next);
      aerial.setExposure(next);
    },
    destroy() {
      sky.destroy();
      aerial.destroy();
      dummy.destroy();
      destroyTextures(textures);
      applyNativeAtmosphere(true);
    },
  };
}

function destroyTextures(textures: BrunetonTextures): void {
  textures.transmittanceTexture.destroy();
  textures.irradianceTexture.destroy();
  textures.scatteringTexture.destroy();
  textures.singleMieScatteringTexture.destroy();
  textures.higherOrderScatteringTexture.destroy();
}

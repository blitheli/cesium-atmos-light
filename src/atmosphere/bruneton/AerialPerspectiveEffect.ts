import * as Cesium from "cesium";
import {
  AtmosphereParameters,
  PRECOMPUTE_CONSTANTS,
  flattenAtmosphereUniform,
} from "./AtmosphereParameters";
import type { BrunetonTextures } from "./PrecomputedTexturesLoader";
import { getSunDirectionWc } from "../../cesium/sunDirection";
import { computeAltitudeCorrectionKm } from "./altitudeCorrection";
import { getSceneContext, type EngineTexture } from "../../cesium/engineApi";
import definitions from "./shaders/bruneton/definitions.glsl?raw";
import common from "./shaders/bruneton/common.glsl?raw";
import runtime from "./shaders/bruneton/runtime.glsl?raw";
import aerialFrag from "./shaders/aerialPerspectiveEffect.frag?raw";

export interface AerialPerspectiveEffectOptions {
  atmosphereParams?: AtmosphereParameters;
  textures?: BrunetonTextures;
  dummyTexture?: EngineTexture;
  exposure?: number;
  autoAddStage?: boolean;
  assetsBaseUrl?: string;
}

export class AerialPerspectiveEffect {
  viewer: Cesium.Viewer;
  atmosphereParams: AtmosphereParameters;
  textures: BrunetonTextures | null;
  stage: Cesium.PostProcessStage | null;
  private _ready: Promise<void> | null;
  private _atmosphereExposure: number;
  private _autoAddStage: boolean;
  private _dummyTexture: EngineTexture | null;

  constructor(viewer: Cesium.Viewer, options: AerialPerspectiveEffectOptions = {}) {
    this.viewer = viewer;
    this.atmosphereParams = options.atmosphereParams ?? new AtmosphereParameters();
    this.textures = options.textures ?? null;
    this._dummyTexture = options.dummyTexture ?? null;
    this._atmosphereExposure = options.exposure ?? 1.0;
    this._autoAddStage = options.autoAddStage ?? false;
    this.stage = null;
    this._ready = null;
  }

  async init(): Promise<void> {
    if (this._ready) return this._ready;
    const scene = this.viewer.scene;
    const context = getSceneContext(scene);
    if (!context.webgl2 || !(context._gl instanceof WebGL2RenderingContext)) {
      throw new Error("WebGL2 required");
    }
    if (!this.textures) {
      throw new Error("AerialPerspectiveEffect requires preloaded textures");
    }
    if (!this._dummyTexture) {
      throw new Error("AerialPerspectiveEffect requires dummyTexture");
    }

    this._ready = (async () => {
      const c = PRECOMPUTE_CONSTANTS;
      const precisionHeader = `
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
`;
      const defines = [
        "#define COMBINED_SCATTERING_TEXTURES",
        `#define SCATTERING_TEXTURE_R_SIZE ${c.SCATTERING_TEXTURE_R_SIZE}`,
        `#define SCATTERING_TEXTURE_MU_SIZE ${c.SCATTERING_TEXTURE_MU_SIZE}`,
        `#define SCATTERING_TEXTURE_MU_S_SIZE ${c.SCATTERING_TEXTURE_MU_S_SIZE}`,
        `#define SCATTERING_TEXTURE_NU_SIZE ${c.SCATTERING_TEXTURE_NU_SIZE}`,
        `#define TRANSMITTANCE_TEXTURE_WIDTH ${c.TRANSMITTANCE_TEXTURE_WIDTH}`,
        `#define TRANSMITTANCE_TEXTURE_HEIGHT ${c.TRANSMITTANCE_TEXTURE_HEIGHT}`,
        `#define IRRADIANCE_TEXTURE_WIDTH ${c.IRRADIANCE_TEXTURE_WIDTH}`,
        `#define IRRADIANCE_TEXTURE_HEIGHT ${c.IRRADIANCE_TEXTURE_HEIGHT}`,
      ].join("\n");

      const globalUniformsForRuntime = `
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;
uniform sampler2D irradiance_texture;
`;

      const fragmentSource =
        precisionHeader +
        defines +
        "\n" +
        definitions +
        "\n" +
        common +
        "\n" +
        globalUniformsForRuntime +
        runtime +
        "\n" +
        aerialFrag;

      const flatAtmosphere = flattenAtmosphereUniform(
        this.atmosphereParams.toUniform(),
      );
      const self = this;
      const uniforms: Record<string, unknown> = {
        u_cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          return new Cesium.Cartesian3(wc.x * 0.001, wc.y * 0.001, wc.z * 0.001);
        },
        u_altitudeCorrection: () =>
          computeAltitudeCorrectionKm(self.viewer, self.atmosphereParams.bottomRadius),
        u_sunDirection: () => getSunDirectionWc(self.viewer),
        u_sunPixelAngle: () => {
          const cam = self.viewer.camera;
          const h =
            (self.viewer.scene.canvas && self.viewer.scene.canvas.clientHeight) ||
            1080;
          const perspective = cam.frustum as Cesium.PerspectiveFrustum;
          const fov = perspective.fov ?? Math.PI / 3;
          return Math.max(fov / h, 1e-6);
        },
        transmittance_texture: () => self.textures!.transmittanceTexture,
        scattering_texture: () => self.textures!.scatteringTexture,
        single_mie_scattering_texture: () =>
          self.textures!.singleMieScatteringTexture,
        higher_order_scattering_texture: () =>
          self.textures!.higherOrderScatteringTexture,
        irradiance_texture: () => self.textures!.irradianceTexture,
        SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: () => {
          const v = self.atmosphereParams.sunRadianceToRelativeLuminance;
          return new Cesium.Cartesian3(v[0]!, v[1]!, v[2]!);
        },
        SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: () => {
          const v = self.atmosphereParams.skyRadianceToRelativeLuminance;
          return new Cesium.Cartesian3(v[0]!, v[1]!, v[2]!);
        },
      };

      for (const [key, value] of Object.entries(flatAtmosphere)) {
        if (
          Array.isArray(value) &&
          value.length === 3 &&
          value.every((n) => typeof n === "number" && Number.isFinite(n))
        ) {
          uniforms[key] = new Cesium.Cartesian3(
            value[0] as number,
            value[1] as number,
            value[2] as number,
          );
        } else {
          uniforms[key] = value;
        }
      }

      const METER_TO_KM = 0.001;
      uniforms["ATMOSPHERE.bottom_radius"] = () =>
        self.atmosphereParams.bottomRadius * METER_TO_KM;
      uniforms["ATMOSPHERE.top_radius"] = () =>
        self.atmosphereParams.topRadius * METER_TO_KM;
      uniforms.u_atmosphereExposure = () => self._atmosphereExposure;

      uniforms.u_cloudShadowEnabled = () => 0;
      uniforms.u_cloudShadowScale = () => 1.0;
      uniforms.u_cloudShadowDecode = () =>
        new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0);
      uniforms.u_cloudShadowBuffer = () => self._dummyTexture!;
      uniforms.u_cloudShadowNear = () => 0.1;
      uniforms.u_cloudShadowFar = () => 200000.0;
      uniforms.u_cloudShadowTopHeight = () => 5000.0;
      uniforms.u_cloudShadowBottomRadius = () => self.atmosphereParams.bottomRadius;
      uniforms.u_cloudShadowIntervals = () => [
        new Cesium.Cartesian2(0, 0),
        new Cesium.Cartesian2(0, 0),
        new Cesium.Cartesian2(0, 0),
        new Cesium.Cartesian2(0, 0),
      ];
      uniforms.u_cloudShadowMatrices = () => [
        Cesium.Matrix4.IDENTITY.clone(),
        Cesium.Matrix4.IDENTITY.clone(),
        Cesium.Matrix4.IDENTITY.clone(),
        Cesium.Matrix4.IDENTITY.clone(),
      ];
      uniforms.u_cloudShadowTexelSize = () => new Cesium.Cartesian2(1, 1);
      uniforms.u_geometricErrorCorrectionAmount = () => 0.0;
      uniforms.u_cloudShadowLengthEnabled = () => 0;
      uniforms.u_cloudShadowLengthScale = () => 1.0;
      uniforms.u_cloudShadowLengthTexture = () => self._dummyTexture!;
      uniforms.u_debugTyndall = () => 0;
      uniforms.u_tyndallScale = () => 1.0;
      uniforms.u_bsmTyndallOpticalDepthScale = () => 1.0;
      uniforms.u_bsmGroundOpticalDepthScale = () => 1.0;

      this.stage = new Cesium.PostProcessStage({
        name: "AerialPerspectiveEffect",
        fragmentShader: fragmentSource,
        uniforms,
      });

      if (self._autoAddStage) {
        scene.postProcessStages.add(this.stage);
      }
    })();

    return this._ready;
  }

  destroy(): void {
    const scene = this.viewer?.scene;
    if (this.stage && scene && scene.postProcessStages) {
      scene.postProcessStages.remove(this.stage);
    }
    this.stage = null;
    this._ready = null;
  }
}

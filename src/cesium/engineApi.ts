import * as Cesium from "cesium";

/**
 * Renderer / private engine symbols used by Bruneton + shadow map.
 * Present at runtime in Cesium 1.140 but omitted from the public .d.ts surface.
 */
export const Engine = Cesium as typeof Cesium & {
  Texture: new (options: Record<string, unknown>) => {
    destroy(): void;
  };
  Texture3D: new (options: Record<string, unknown>) => {
    destroy(): void;
  };
  Sampler: new (options: Record<string, unknown>) => unknown;
  TextureWrap: {
    CLAMP_TO_EDGE: number;
    REPEAT: number;
    MIRRORED_REPEAT: number;
  };
  ShadowMap: new (options: Record<string, unknown>) => Cesium.ShadowMap;
};

export type EngineTexture = InstanceType<typeof Engine.Texture>;
export type EngineTexture3D = InstanceType<typeof Engine.Texture3D>;
export type EngineContext = {
  webgl2: boolean;
  _gl: WebGLRenderingContext | WebGL2RenderingContext;
  halfFloatingPointTexture?: boolean;
  colorBufferHalfFloat?: boolean;
  colorBufferFloat?: boolean;
  floatingPointTexture?: boolean;
  uniformState: {
    sunDirectionWC: Cesium.Cartesian3;
  };
};

export function getSceneContext(scene: Cesium.Scene): EngineContext {
  return (scene as unknown as { context: EngineContext }).context;
}

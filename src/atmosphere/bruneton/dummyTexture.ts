import { Engine, type EngineContext, type EngineTexture } from "../../cesium/engineApi";

export function makeDummyTexture(context: EngineContext): EngineTexture {
  return new Engine.Texture({
    context,
    width: 1,
    height: 1,
    pixelFormat: Engine.PixelFormat.RGBA,
    pixelDatatype: Engine.PixelDatatype.UNSIGNED_BYTE,
    source: {
      arrayBufferView: new Uint8Array([0, 0, 0, 255]),
      width: 1,
      height: 1,
    },
  });
}

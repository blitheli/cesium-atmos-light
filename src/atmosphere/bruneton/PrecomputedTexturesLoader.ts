import * as Cesium from "cesium";
import { PRECOMPUTE_CONSTANTS } from "./AtmosphereParameters";

const C = PRECOMPUTE_CONSTANTS;

export interface BrunetonTextures {
  transmittanceTexture: Cesium.Texture;
  irradianceTexture: Cesium.Texture;
  scatteringTexture: Cesium.Texture3D;
  singleMieScatteringTexture: Cesium.Texture3D;
  higherOrderScatteringTexture: Cesium.Texture3D;
}

function float16ToFloat32(u16: number): number {
  const sign = (u16 & 0x8000) >> 15;
  const exp = (u16 & 0x7c00) >> 10;
  const frac = u16 & 0x03ff;
  if (exp === 0) {
    return (sign ? -1 : 1) * (frac ? Math.pow(2, -14) * (frac / 1024) : 0);
  }
  if (exp === 31) {
    return frac ? Number.NaN : sign ? -Infinity : Infinity;
  }
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

function decodeFloat16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const uint16 = new Uint16Array(buffer);
  const n = uint16.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = float16ToFloat32(uint16[i]!);
  }
  return out;
}

function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.arrayBuffer();
  });
}

function makeSampler(): Cesium.Sampler {
  return new Cesium.Sampler({
    minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
    magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
    wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
    wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
  });
}

function makeSampler3D(): Cesium.Sampler {
  return new Cesium.Sampler({
    minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
    magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
    wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
    wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
    wrapR: Cesium.TextureWrap.CLAMP_TO_EDGE,
  });
}

export async function loadPrecomputedTextures(
  baseUrl: string,
  context: Cesium.Context,
): Promise<BrunetonTextures> {
  const base = baseUrl.replace(/\/?$/, "/");

  const [transBuf, irrBuf, scatterBuf, singleMieScatterBuf, higherOrderScatterBuf] =
    await Promise.all([
      fetchArrayBuffer(base + "transmittance.bin"),
      fetchArrayBuffer(base + "irradiance.bin"),
      fetchArrayBuffer(base + "scattering.bin"),
      fetchArrayBuffer(base + "single_mie_scattering.bin"),
      fetchArrayBuffer(base + "higher_order_scattering.bin"),
    ]);

  const tw = C.TRANSMITTANCE_TEXTURE_WIDTH;
  const th = C.TRANSMITTANCE_TEXTURE_HEIGHT;
  const iw = C.IRRADIANCE_TEXTURE_WIDTH;
  const ih = C.IRRADIANCE_TEXTURE_HEIGHT;
  const sw = C.SCATTERING_TEXTURE_WIDTH;
  const sh = C.SCATTERING_TEXTURE_HEIGHT;
  const sd = C.SCATTERING_TEXTURE_DEPTH;

  const transF32 = decodeFloat16ToFloat32(transBuf);
  const irrF32 = decodeFloat16ToFloat32(irrBuf);
  const scatterF32 = decodeFloat16ToFloat32(scatterBuf);
  const singleMieScatterF32 = decodeFloat16ToFloat32(singleMieScatterBuf);
  const higherOrderScatterF32 = decodeFloat16ToFloat32(higherOrderScatterBuf);

  const transmittanceTexture = new Cesium.Texture({
    context,
    width: tw,
    height: th,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: transF32, width: tw, height: th },
    sampler: makeSampler(),
  });

  const irradianceTexture = new Cesium.Texture({
    context,
    width: iw,
    height: ih,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: irrF32, width: iw, height: ih },
    sampler: makeSampler(),
  });

  const scatteringTexture = new Cesium.Texture3D({
    context,
    width: sw,
    height: sh,
    depth: sd,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: scatterF32 },
    sampler: makeSampler3D(),
  });

  const singleMieScatteringTexture = new Cesium.Texture3D({
    context,
    width: sw,
    height: sh,
    depth: sd,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: singleMieScatterF32 },
    sampler: makeSampler3D(),
  });

  const higherOrderScatteringTexture = new Cesium.Texture3D({
    context,
    width: sw,
    height: sh,
    depth: sd,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: higherOrderScatterF32 },
    sampler: makeSampler3D(),
  });

  return {
    transmittanceTexture,
    irradianceTexture,
    scatteringTexture,
    singleMieScatteringTexture,
    higherOrderScatteringTexture,
  };
}

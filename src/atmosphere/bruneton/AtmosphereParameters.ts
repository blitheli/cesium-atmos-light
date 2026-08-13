export const METER_TO_LENGTH_UNIT = 1 / 1000;

export const PRECOMPUTE_CONSTANTS = {
  TRANSMITTANCE_TEXTURE_WIDTH: 256,
  TRANSMITTANCE_TEXTURE_HEIGHT: 64,
  SCATTERING_TEXTURE_R_SIZE: 32,
  SCATTERING_TEXTURE_MU_SIZE: 128,
  SCATTERING_TEXTURE_MU_S_SIZE: 32,
  SCATTERING_TEXTURE_NU_SIZE: 8,
  SCATTERING_TEXTURE_WIDTH: 8 * 32,
  SCATTERING_TEXTURE_HEIGHT: 128,
  SCATTERING_TEXTURE_DEPTH: 32,
  IRRADIANCE_TEXTURE_WIDTH: 64,
  IRRADIANCE_TEXTURE_HEIGHT: 16,
  METER_TO_LENGTH_UNIT: 1 / 1000,
};

export function flattenAtmosphereUniform(
  atmosphereUniform: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(atmosphereUniform)) {
    if (Array.isArray(value)) {
      out[`ATMOSPHERE.${key}`] = value;
    } else if (value && typeof value === "object" && "layers" in value) {
      const layers = (value as { layers: Array<Record<string, unknown>> }).layers;
      layers.forEach((layer, i) => {
        for (const [k, v] of Object.entries(layer)) {
          out[`ATMOSPHERE.${key}.layers[${i}].${k}`] = v;
        }
      });
    } else {
      out[`ATMOSPHERE.${key}`] = value;
    }
  }
  return out;
}

function radians(deg: number): number {
  return (deg * Math.PI) / 180;
}

const LUMINANCE_COEFFS = [0.2126, 0.7152, 0.0722];

function dot3(a: number[], b: number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

export class DensityProfileLayer {
  width: number;
  expTerm: number;
  expScale: number;
  linearTerm: number;
  constantTerm: number;

  constructor(
    width: number,
    expTerm: number,
    expScale: number,
    linearTerm: number,
    constantTerm: number,
  ) {
    this.width = width;
    this.expTerm = expTerm;
    this.expScale = expScale;
    this.linearTerm = linearTerm;
    this.constantTerm = constantTerm;
  }

  toUniform(): Record<string, number> {
    return {
      width: this.width,
      exp_term: this.expTerm,
      exp_scale: this.expScale,
      linear_term: this.linearTerm,
      constant_term: this.constantTerm,
    };
  }
}

export class AtmosphereParameters {
  bottomRadius = 6367720;
  topRadius = 6420000;
  sunAngularRadius = 0.004675;
  solarIrradiance = [1.474, 1.8504, 1.91198];
  rayleighDensity = [
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.125, 0, 0),
  ];
  rayleighScattering = [0.005802, 0.013558, 0.0331];
  mieDensity = [
    new DensityProfileLayer(0, 0, 0, 0, 0),
    new DensityProfileLayer(0, 1, -0.833333, 0, 0),
  ];
  mieScattering = [0.003996, 0.003996, 0.003996];
  mieExtinction = [0.00444, 0.00444, 0.00444];
  miePhaseFunctionG = 0.8;
  absorptionDensity = [
    new DensityProfileLayer(25, 0, 0, 1 / 15, -2 / 3),
    new DensityProfileLayer(0, 0, 0, -1 / 15, 8 / 3),
  ];
  absorptionExtinction = [0.00065, 0.001881, 0.000085];
  groundAlbedo = [0.1, 0.1, 0.1];
  muSMin = Math.cos(radians(120));
  sunRadianceToLuminance = [98242.786222, 69954.398112, 66475.012354];
  skyRadianceToLuminance = [114974.916437, 71305.954816, 65310.548555];
  sunRadianceToRelativeLuminance: number[];
  skyRadianceToRelativeLuminance: number[];

  constructor() {
    const sunLum = this.sunRadianceToLuminance;
    const luminance = dot3(LUMINANCE_COEFFS, sunLum);
    this.sunRadianceToRelativeLuminance = sunLum.map((c) => c / luminance);
    this.skyRadianceToRelativeLuminance = this.skyRadianceToLuminance.map(
      (c) => c / luminance,
    );
  }

  toUniform(): Record<string, unknown> {
    return {
      solar_irradiance: this.solarIrradiance,
      sun_angular_radius: this.sunAngularRadius,
      bottom_radius: this.bottomRadius * METER_TO_LENGTH_UNIT,
      top_radius: this.topRadius * METER_TO_LENGTH_UNIT,
      rayleigh_density: {
        layers: this.rayleighDensity.map((layer) => layer.toUniform()),
      },
      rayleigh_scattering: this.rayleighScattering,
      mie_density: {
        layers: this.mieDensity.map((layer) => layer.toUniform()),
      },
      mie_scattering: this.mieScattering,
      mie_extinction: this.mieExtinction,
      mie_phase_function_g: this.miePhaseFunctionG,
      absorption_density: {
        layers: this.absorptionDensity.map((layer) => layer.toUniform()),
      },
      absorption_extinction: this.absorptionExtinction,
      ground_albedo: this.groundAlbedo,
      mu_s_min: this.muSMin,
    };
  }
}

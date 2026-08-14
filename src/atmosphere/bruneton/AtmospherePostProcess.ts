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
import sky from "./shaders/sky.glsl?raw";

function buildSkyFragmentSource(definitionsSource: string, commonSource: string, runtimeSource: string, skySource: string): string {
  const c = PRECOMPUTE_CONSTANTS;
  const precisionHeader = `
precision highp float;
precision highp sampler2D;
precision highp sampler3D;
`;
  const defines = [
    '#define COMBINED_SCATTERING_TEXTURES',
    // Cesium 相机是透视为主，这里直接开启以复刻 SkyMaterial 的太阳/月亮抗锯齿逻辑
    '#define PERSPECTIVE_CAMERA',
    '#define SUN',
    `#define SCATTERING_TEXTURE_R_SIZE ${c.SCATTERING_TEXTURE_R_SIZE}`,
    `#define SCATTERING_TEXTURE_MU_SIZE ${c.SCATTERING_TEXTURE_MU_SIZE}`,
    `#define SCATTERING_TEXTURE_MU_S_SIZE ${c.SCATTERING_TEXTURE_MU_S_SIZE}`,
    `#define SCATTERING_TEXTURE_NU_SIZE ${c.SCATTERING_TEXTURE_NU_SIZE}`,
    `#define TRANSMITTANCE_TEXTURE_WIDTH ${c.TRANSMITTANCE_TEXTURE_WIDTH}`,
    `#define TRANSMITTANCE_TEXTURE_HEIGHT ${c.TRANSMITTANCE_TEXTURE_HEIGHT}`,
    `#define IRRADIANCE_TEXTURE_WIDTH ${c.IRRADIANCE_TEXTURE_WIDTH}`,
    `#define IRRADIANCE_TEXTURE_HEIGHT ${c.IRRADIANCE_TEXTURE_HEIGHT}`,
  ].join('\n');

  const globalUniformsForRuntime = `
uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler2D irradiance_texture;
`;

  const mainBlock = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;
uniform vec3 u_cameraPosition;
uniform vec3 u_altitudeCorrection;
uniform vec3 u_sunDirection;
uniform vec3 u_groundAlbedo;
// 每像素对应的角度（弧度），用于太阳边缘抗锯齿；当 dFdx 不可用时作为 fallback（与 three-geospatial PERSPECTIVE_CAMERA 一致）
uniform float u_sunPixelAngle;
// 线性曝光（在 ACES 之前）；OETF 仅在后接 AerialPerspectiveEffect 做一次
uniform float u_atmosphereExposure;

// Cloud shadow (BSM) - Cesium 仅支持 sampler2D，使用 2×2 图集（每 cascade 一 tile）
uniform sampler2D u_cloudShadowBuffer;
uniform float u_cloudShadowScale;
uniform vec4 u_cloudShadowDecode;
uniform int u_cloudShadowEnabled;
uniform mat4 u_cloudShadowMatrices[4];
uniform vec2 u_cloudShadowIntervals[4];
uniform float u_cloudShadowNear;
uniform float u_cloudShadowFar;
uniform float u_cloudShadowTopHeight;
uniform float u_cloudShadowBottomRadius;
uniform vec2 u_cloudShadowTexelSize;
uniform float u_geometricErrorCorrectionAmount;
// three-geospatial 对齐：直接消费 shadowLengthBuffer（长度单位与大气 length unit 一致，当前为 km）
uniform sampler2D u_shadowLengthBuffer;
uniform int u_shadowLengthEnabled;
uniform float u_shadowLengthScale;
uniform int u_debugTyndall;
// 为 0 时几何像素不透传 Bruneton 地面项（只做天空），避免与 AerialPerspectiveEffect 双重叠加导致过曝/死黑/晨昏线色偏
uniform int u_applyGroundAtmosphere;
// 丁达尔光柱强度：对 shadow length 的缩放，>1 时阴影更明显（光柱更暗）
uniform float u_tyndallScale;
// BSM 光学厚度缩放：用于丁达尔/光柱（仅影响 shadowLength）
uniform float u_bsmTyndallOpticalDepthScale;
// BSM 光学厚度缩放：用于地面太阳遮光（仅影响地面变暗）
uniform float u_bsmGroundOpticalDepthScale;
uniform int u_renderSky;

const float MAX_FLOAT = 1e20;

// Cesium executes user PostProcessStages after its HDR tonemapper. Convert only
// newly generated Bruneton radiance to the same display-referred color space.
vec3 brunetonToDisplay(vec3 linearColor) {
  linearColor = max(linearColor, vec3(0.0));
  return czm_inverseGamma(czm_pbrNeutralTonemapping(linearColor));
}

// 2×2 图集：cascade 0=左上, 1=右上, 2=左下, 3=右下
vec2 getCloudShadowAtlasOffset(int ci) {
  float x = mod(float(ci), 2.0) * 0.5;
  float y = (ci < 2) ? 0.5 : 0.0;
  return vec2(x, y);
}

// Cesium 的矩阵/深度距离单位是“米”，而 Bruneton/LUT 这套在本工程中使用“千米”(lengthUnit=km)。
// ACES + gamma 改由 AerialPerspectiveEffect 在链路末端统一处理（避免与天空 pass 重复 OETF）。
const float METER_TO_LENGTH_UNIT = 0.001;


float raySphereFirstIntersection(const vec3 ro, const vec3 rd, const float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float disc = b * b - c;
  if (disc <= 0.0) return -1.0;
  float t = -b - sqrt(disc);
  return t;
}

float readBSMOpticalDepth(vec3 posMeters) {
  float scale = max(u_cloudShadowScale, 1e-6);
  for (int ci = 0; ci < 4; ci++) {
    vec4 clip = u_cloudShadowMatrices[ci] * vec4(posMeters, 1.0);
    clip /= clip.w;
    vec2 uv = clip.xy * 0.5 + 0.5;
    if (uv.x < 0.01 || uv.x > 0.99 || uv.y < 0.01 || uv.y > 0.99) continue;
    vec2 atlasUv = getCloudShadowAtlasOffset(ci) + uv * 0.5;
    vec4 shadow = (texture(u_cloudShadowBuffer, atlasUv) / scale) * u_cloudShadowDecode;
    return shadow.b * max(u_bsmTyndallOpticalDepthScale, 0.0);
  }
  return 0.0;
}

float saturateAP(float x) { return clamp(x, 0.0, 1.0); }

float viewZToOrthographicDepth(float viewZ, float near, float far) {
  return (viewZ + near) / (near - far);
}

int getFadedCascadeIndex(mat4 viewMat, vec3 worldPos, vec2 intervals[4], float near, float far, float jitter) {
  vec4 vp = viewMat * vec4(worldPos, 1.0);
  float depth = viewZToOrthographicDepth(vp.z, near, far);
  int nextIndex = -1;
  int prevIndex = -1;
  float alpha = 1.0;
  for (int i = 0; i < 4; ++i) {
    vec2 interval = intervals[i];
    float intervalCenter = (interval.x + interval.y) * 0.5;
    float closestEdge = depth < intervalCenter ? interval.x : interval.y;
    float margin = closestEdge * closestEdge * 0.5;
    interval += margin * vec2(-0.5, 0.5);
    if (i < 3) {
      if (depth >= interval.x && depth < interval.y) {
        prevIndex = nextIndex;
        nextIndex = i;
        alpha = saturateAP(min(depth - interval.x, interval.y - depth) / max(margin, 1e-6));
      }
    } else {
      if (depth >= interval.x) {
        prevIndex = nextIndex;
        nextIndex = i;
        alpha = saturateAP((depth - interval.x) / max(margin, 1e-6));
      }
    }
  }
  return jitter <= alpha ? nextIndex : prevIndex;
}

vec2 getShadowUvGround(vec3 worldPos, int ci) {
  vec4 clip = u_cloudShadowMatrices[ci] * vec4(worldPos, 1.0);
  clip /= clip.w;
  return clip.xy * 0.5 + 0.5;
}

float interleavedGradientNoiseAP(vec2 coord) {
  const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(coord, magic.xy)));
}

vec2 vogelDiskAP(int index, int count, float phi) {
  const float goldenAngle = 2.39996322972865332;
  float r = sqrt(float(index) + 0.5) / sqrt(float(count));
  float theta = float(index) * goldenAngle + phi;
  return r * vec2(cos(theta), sin(theta));
}

float readShadowOpticalDepthGround(vec2 uv, int ci, float distToTop) {
  float scale = max(u_cloudShadowScale, 1e-6);
  vec2 atlasUv = getCloudShadowAtlasOffset(ci) + uv * 0.5;
  vec4 shadow = (texture(u_cloudShadowBuffer, atlasUv) / scale) * u_cloudShadowDecode;
  float od = min(shadow.b, shadow.g * max(0.0, distToTop - shadow.r));
  return od * max(u_bsmGroundOpticalDepthScale, 0.0);
}

float sampleShadowOpticalDepthPCFGround(vec3 worldPos, float distToTop, float radius, int ci) {
  vec2 uv = getShadowUvGround(worldPos, ci);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 texel = max(u_cloudShadowTexelSize, vec2(1e-4));
  if (radius < 0.1) return readShadowOpticalDepthGround(uv, ci, distToTop);
  float sum = 0.0;
  float phi = interleavedGradientNoiseAP(gl_FragCoord.xy) * 6.28318530718;
  for (int i = 0; i < 16; ++i) {
    sum += readShadowOpticalDepthGround(uv + vogelDiskAP(i, 16, phi) * radius * texel, ci, distToTop);
  }
  return sum / 16.0;
}

vec3 correctBsmPosition(vec3 posMeters, float amount) {
  if (amount <= 0.0) return posMeters;
  vec3 sphereNormal = normalize(posMeters);
  vec3 spherePosition = u_cloudShadowBottomRadius * sphereNormal;
  return mix(posMeters, spherePosition, saturateAP(amount));
}

vec3 stabilizeBsmSamplePosition(vec3 posMeters, float viewDistMeters) {
  float geoAmt = max(u_geometricErrorCorrectionAmount, 0.0);
  float distAmt = smoothstep(8000.0, 50000.0, viewDistMeters);
  float amount = saturateAP(max(geoAmt, distAmt));
  vec3 corrected = correctBsmPosition(posMeters, amount);
  if (amount < 0.01) return corrected;
  vec3 n = normalize(corrected);
  float h = length(posMeters) - u_cloudShadowBottomRadius;
  float stableH = mix(h, max(h, 0.0) * (1.0 - 0.85 * amount), amount);
  return n * (u_cloudShadowBottomRadius + stableH);
}

float getGroundSunTransmittance(vec3 rawWorldPosMeters) {
  if (u_cloudShadowEnabled == 0) return 1.0;
  vec3 camMeters = (u_cameraPosition + u_altitudeCorrection) / METER_TO_LENGTH_UNIT;
  float viewDist = length(rawWorldPosMeters - camMeters);
  vec3 samplePos = stabilizeBsmSamplePosition(rawWorldPosMeters, viewDist);

  vec3 groundNormal = normalize(samplePos);
  float sunSinElev = dot(u_sunDirection, groundNormal);
  float horizonFade = smoothstep(-0.02, 0.02, sunSinElev);
  if (horizonFade <= 0.0) return 1.0;

  float topShellR = u_cloudShadowBottomRadius + u_cloudShadowTopHeight;
  vec3 rd = u_sunDirection;
  float bS = dot(rd, samplePos);
  float cS = dot(samplePos, samplePos) - topShellR * topShellR;
  float discS = bS * bS - cS;
  if (discS <= 0.0) return 1.0;
  float distToShadowTop = -bS + sqrt(discS);
  if (distToShadowTop <= 0.0) return 1.0;

  float lowSunFade = smoothstep(0.0, 0.087, sunSinElev);
  float rayLenFade = 1.0 - smoothstep(u_cloudShadowTopHeight * 6.0,
                                       u_cloudShadowTopHeight * 20.0,
                                       distToShadowTop);
  float fade = horizonFade * lowSunFade * rayLenFade;
  if (fade <= 0.0) return 1.0;

  float jitter = interleavedGradientNoiseAP(gl_FragCoord.xy);
  float near = max(u_cloudShadowNear, 1e-3);
  float far = max(u_cloudShadowFar, near + 1.0);
  int ci = getFadedCascadeIndex(czm_view, samplePos, u_cloudShadowIntervals, near, far, jitter);
  if (ci < 0) return 1.0;

  float pcfRadius = mix(1.5, 3.0, saturateAP(viewDist / max(far, 1.0)));
  float opticalDepth = sampleShadowOpticalDepthPCFGround(samplePos, distToShadowTop, pcfRadius, ci);
  float shade = exp(-opticalDepth);
  return mix(1.0, shade, fade);
}

float marchShadowLengthAtm(vec3 cameraKm, vec3 rd, float tNear, float tFar) {
  if (u_cloudShadowEnabled == 0) return 0.0;
  float maxDist = tFar - tNear;
  if (maxDist <= 0.0) return 0.0;
  const int STEPS = 64;
  float stepSize = maxDist / float(STEPS);
  float shadowLen = 0.0;
  float attenuation = 1.0;
  for (int i = 0; i < STEPS; i++) {
    float t = tNear + (float(i) + 0.5) * stepSize;
    vec3 posKm = cameraKm + rd * t;
    vec3 posMeters = posKm / METER_TO_LENGTH_UNIT;
    float opticalDepth = readBSMOpticalDepth(posMeters);
    // stepSize 与 camera 均为 km → 累加结果已是 Bruneton length unit (km)
    shadowLen += (1.0 - exp(-opticalDepth)) * stepSize * attenuation;
    attenuation *= 0.9995;
  }
  // 切勿再 / METER_TO_LENGTH_UNIT：那会把 km 再 ×1000，shadowLength 爆表后
  // GetSkyRadiance 光柱分支把整片天空压黑（开 BSM init 后天空全黑的根因）。
  return shadowLen * max(u_tyndallScale, 0.0);
}

float readShadowLengthBuffer(vec2 uv) {
  if (u_shadowLengthEnabled == 0) return 0.0;
  // 约定：buffer 中存储的就是 Bruneton 所需的 shadowLength（length unit, km）
  // scale 用于可选的编码/解码缩放（默认 1.0）
  return max(texture(u_shadowLengthBuffer, uv).r, 0.0) * max(u_shadowLengthScale, 0.0);
}

void reconstructRay(out vec3 ro, out vec3 rd) {
  ro = u_cameraPosition + u_altitudeCorrection;
  // 用 Cesium window→eye 的近/远平面差分求视线，避免 clip z=1 + inverseProjection
  // 在 log-depth / 多视锥 / 仰视净空时得到退化或错误方向（天顶 GetSkyRadiance≈0 → 整屏黑）。
  vec4 eyeNear = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, 0.0, 1.0));
  vec4 eyeFar = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, 1.0, 1.0));
  if (abs(eyeNear.w) > 1e-10) eyeNear /= eyeNear.w;
  if (abs(eyeFar.w) > 1e-10) eyeFar /= eyeFar.w;
  vec3 dirEC = eyeFar.xyz - eyeNear.xyz;
  float dirLen2 = dot(dirEC, dirEC);
  if (dirLen2 < 1e-20) {
    // 远近重合时退化为远点方向
    dirEC = eyeFar.xyz;
  }
  // w=0 只变换方向到世界系（米制 ECEF），与 length unit 无关
  rd = normalize((czm_inverseView * vec4(normalize(dirEC), 0.0)).xyz);
}

// 与 Shaders/aerialPerspectiveEffect.frag 一致：前向半直线与球的交点判定
bool rayForwardHitsSphereAP(vec3 o, vec3 d, float R) {
  float b = dot(o, d);
  float c = dot(o, o) - R * R;
  float disc = b * b - c;
  if (disc < 0.0) {
    return false;
  }
  float s = sqrt(disc);
  float t0 = -b - s;
  float t1 = -b + s;
  return (t0 > 1e-6) || (t1 > 1e-6);
}

bool cameraInAtmosphereShellAP(vec3 o, float bottomR, float topR) {
  float r = length(o);
  return r > bottomR + 1e-5 && r < topR - 1e-5;
}

void main() {
  vec4 originalColor = texture(colorTexture, v_textureCoordinates);
  float depth = czm_readDepth(depthTexture, v_textureCoordinates);

  vec3 cameraPosition = u_cameraPosition;
  vec3 rayDirection;
  reconstructRay(cameraPosition, rayDirection);
  rayDirection = normalize(rayDirection);

  // Reconstruct raw ECEF world position from depth buffer
  vec3 rawWorldPosMeters = vec3(0.0);
  float sceneDist = MAX_FLOAT;
  // 基于 eye-space 重建来判定是否命中几何，避免远距 depth 阈值误判
  bool hasScene = false;
  if (depth < 1.0 - 1e-8) {
    vec4 eyePos = czm_windowToEyeCoordinates(vec4(gl_FragCoord.xy, depth, 1.0));
    if (abs(eyePos.w) > 1e-6) {
      eyePos /= eyePos.w;
      // 掠射/天际附近 eyePos.z 在 0 附近抖动 → hasScene 帧间跳变 → isSky 与透传黑底交替闪烁；略收严
      if (eyePos.z < -1e-4) {
        hasScene = true;
        vec4 worldPos4 = czm_inverseView * eyePos;
        rawWorldPosMeters = worldPos4.xyz;
        vec3 sceneWorldPosKm = rawWorldPosMeters * METER_TO_LENGTH_UNIT + u_altitudeCorrection;
        sceneDist = length(sceneWorldPosKm - cameraPosition);
      }
    }
  }

  float bottomRadius = ATMOSPHERE.bottom_radius;
  float topRadius = ATMOSPHERE.top_radius;
  float camR = length(cameraPosition);

  // —— 天空/地面判定 ——
  // Cesium 在「地平线出屏 / 无地形」时仍可能由 depth plane 写入假 depth：
  // hasScene=true 但 color 仍是清屏黑。旧逻辑信任 hasScene → isSky=false →
  // applyGroundAtmosphere=0 透传黑底 → 仰视整屏变黑。
  // 主判据改用 Bruneton RayIntersectsGround（与 three-geospatial SkyMaterial 一致），
  // depth 只用来识别「有真实着色的 Cesium 几何」。
  bool hitBottom = rayForwardHitsSphereAP(cameraPosition, rayDirection, bottomRadius);
  bool hitTop = rayForwardHitsSphereAP(cameraPosition, rayDirection, topRadius);
  bool inShell = cameraInAtmosphereShellAP(cameraPosition, bottomRadius, topRadius);
  vec3 radialOut = normalize(cameraPosition);
  float muLook = dot(rayDirection, radialOut);

  const float AP_DEPTH_SKY_EPS = 1e-4;
  bool hasSceneDepth = depth < 1.0 - AP_DEPTH_SKY_EPS;

  const float MU_EXPLICIT_GROUND = -0.01;
  const float SHELL_SKY_DEPTH_SLOP = 0.014;
  const float SKY_OVERRIDE_MU = 0.05;
  const float SKY_OVERRIDE_DEPTH = 1.0 - SHELL_SKY_DEPTH_SLOP;
  // 清屏/假 depth 的原色接近黑；真实地形/模型通常有明显亮度
  float sceneLum = dot(originalColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  bool realScene = hasScene && sceneLum >= 0.06;

  bool brunetonIntersectsGround = RayIntersectsGround(ATMOSPHERE, camR, muLook);
  bool explicitGround = brunetonIntersectsGround || hitBottom || (hasSceneDepth && muLook < MU_EXPLICIT_GROUND);
  bool cameraOutsideAtmosphere = camR > topRadius + 1e-5;
  bool forceGroundFromDepth = realScene && cameraOutsideAtmosphere;
  bool passOriginalSpace = (muLook > 1e-5) && !hitTop;

  bool depthLikelySky = depth >= 1.0 - SHELL_SKY_DEPTH_SLOP;
  bool skyOverrideFromView =
    (muLook > SKY_OVERRIDE_MU) &&
    (depth >= SKY_OVERRIDE_DEPTH) &&
    !explicitGround;

  bool isSky = false;
  if (u_applyGroundAtmosphere == 0) {
    // 与 Aerial 分流：天空走 Bruneton；真几何原样留给 Aerial
    // 朝天且缓冲仍接近清屏黑 → 无视假 depth，强制天空（地平线出屏场景）
    if (!brunetonIntersectsGround && sceneLum < 0.06) {
      isSky = true;
    } else if (realScene) {
      isSky = false;
    } else {
      isSky = !brunetonIntersectsGround;
    }
  } else if (inShell) {
    if (realScene && !skyOverrideFromView) {
      isSky = false;
    } else {
      isSky = (depthLikelySky || !brunetonIntersectsGround) && !explicitGround;
    }
  } else if (cameraOutsideAtmosphere) {
    if (forceGroundFromDepth) {
      isSky = false;
    } else if (passOriginalSpace) {
      isSky = true;
    } else {
      isSky = !brunetonIntersectsGround;
    }
  } else {
    isSky = !brunetonIntersectsGround && muLook > SKY_OVERRIDE_MU;
  }

  // 地面分支仍依赖 depth 重建；若几何上已判地面但深度未重建出 hit，用 bottom 球前向交点兜底（同 aerial）
  if (!isSky && !hasScene && hitBottom) {
    float bG = dot(cameraPosition, rayDirection);
    float cG = dot(cameraPosition, cameraPosition) - bottomRadius * bottomRadius;
    float discG = bG * bG - cG;
    if (discG > 0.0) {
      float sG = sqrt(discG);
      float tHitG = -bG - sG;
      if (tHitG <= 1e-6) {
        tHitG = -bG + sG;
      }
      if (tHitG > 1e-6) {
        hasScene = true;
        vec3 sceneKmG = cameraPosition + rayDirection * tHitG;
        rawWorldPosMeters = sceneKmG / METER_TO_LENGTH_UNIT;
        sceneDist = tHitG;
      }
    }
  }

  float b = dot(cameraPosition, rayDirection);
  float c = dot(cameraPosition, cameraPosition) - topRadius * topRadius;
  float disc = b * b - c;
  float tMax = MAX_FLOAT;
  float tEnterTop = 0.0;
  if (disc > 0.0) {
    float s = sqrt(disc);
    float t0 = -b - s;
    float t1 = -b + s;
    tEnterTop = (t0 > 0.0) ? t0 : max(t1, 0.0);
    tMax = max(t1, 0.0);
  }
  c = dot(cameraPosition, cameraPosition) - bottomRadius * bottomRadius;
  disc = b * b - c;
  if (disc > 0.0) {
    float tHit = -b - sqrt(disc);
    if (tHit > 0.0) tMax = min(tMax, tHit);
  }

  // Shadow length: march along view ray sampling BSM (Tyndall / God rays)
  // 云层典型高度 2~15km， marching 区间收紧到 0~25km 以提高采样密度
  float marchMax = 25.0;
  float startT = (isSky && camR > topRadius + 1e-3) ? tEnterTop : 0.0;
  float shadowRayEnd = isSky ? min(tMax, startT + marchMax) : min(sceneDist, marchMax);
  float shadowRayBegin = max(startT, shadowRayEnd - marchMax);
  // 优先 shadowLengthBuffer；未提供纹理时回退为沿视线 BSM 步进（与 three-geospatial 丁达尔一致）
  float shadowLength;
  if (u_shadowLengthEnabled != 0) {
    shadowLength = readShadowLengthBuffer(v_textureCoordinates) * max(u_tyndallScale, 0.0);
  } else if (u_cloudShadowEnabled != 0) {
    shadowLength = marchShadowLengthAtm(cameraPosition, rayDirection, shadowRayBegin, shadowRayEnd);
  } else {
    shadowLength = 0.0;
  }

  vec3 transmittance;
  vec3 finalColor;

  if (isSky) {
      // 注意：getSkyRadiance 内部会自己计算 transmittance
      vec3 skyRadiance = getSkyRadiance(
        cameraPosition,
        rayDirection,
        shadowLength,
        u_sunDirection
      );
      finalColor = brunetonToDisplay(skyRadiance * u_atmosphereExposure);
  } else if (u_applyGroundAtmosphere == 0) {
    // 地面/几何交给后续 AerialPerspectiveEffect 等单独 pass，避免两次 * transmittance + inscatter
    finalColor = originalColor.rgb;
  } else {
    // 关键：直接使用 depth 重建出的世界坐标作为命中点，避免 camera + ray * dist 在远距下误差放大引发闪烁
    vec3 scenePos = rawWorldPosMeters * METER_TO_LENGTH_UNIT;
    vec3 inscatter = GetSkyRadianceToPoint(
      cameraPosition,
      scenePos,
      shadowLength,
      u_sunDirection,
      transmittance
    );
    float sunTransmittance = getGroundSunTransmittance(rawWorldPosMeters);
    finalColor = originalColor.rgb * transmittance * sunTransmittance + inscatter;
  }

  out_FragColor = vec4(finalColor, originalColor.a);
}
`;

  return (
    precisionHeader +
    defines + '\n' +
    definitionsSource + '\n' +
    commonSource + '\n' +
    globalUniformsForRuntime +
    runtimeSource + '\n' +
    skySource + '\n' +
    mainBlock
  );
}



export interface AtmospherePostProcessOptions {
  atmosphereParams?: AtmosphereParameters;
  textures?: BrunetonTextures;
  dummyTexture?: EngineTexture;
  exposure?: number;
  applyGroundAtmosphere?: boolean;
  autoAddStage?: boolean;
  assetsBaseUrl?: string;
}

export class AtmospherePostProcess {
  viewer: Cesium.Viewer;
  atmosphereParams: AtmosphereParameters;
  textures: BrunetonTextures | null;
  stage: Cesium.PostProcessStage | null;
  private _ready: Promise<void> | null;
  private _atmosphereExposure: number;
  private _applyGroundAtmosphere: boolean;
  private _autoAddStage: boolean;
  private _dummyTexture: EngineTexture | null;
  private _renderSky: boolean;

  constructor(viewer: Cesium.Viewer, options: AtmospherePostProcessOptions = {}) {
    this.viewer = viewer;
    this.atmosphereParams = options.atmosphereParams ?? new AtmosphereParameters();
    this.textures = options.textures ?? null;
    this._dummyTexture = options.dummyTexture ?? null;
    this._atmosphereExposure = options.exposure ?? 1.0;
    this._applyGroundAtmosphere = options.applyGroundAtmosphere ?? false;
    this._autoAddStage = options.autoAddStage ?? false;
    this._renderSky = true;
    this.stage = null;
    this._ready = null;
  }

  setExposure(exposure: number): void {
    this._atmosphereExposure = exposure;
  }

  async init(): Promise<void> {
    if (this._ready) return this._ready;
    const scene = this.viewer.scene;
    const context = getSceneContext(scene);
    if (!context.webgl2 || !(context._gl instanceof WebGL2RenderingContext)) {
      throw new Error("WebGL2 required");
    }
    if (!this.textures) {
      throw new Error("AtmospherePostProcess requires preloaded textures");
    }
    if (!this._dummyTexture) {
      throw new Error("AtmospherePostProcess requires dummyTexture");
    }

    this._ready = (async () => {
      const fragmentSource = buildSkyFragmentSource(definitions, common, runtime, sky);
      const self = this;
      const flatAtmosphere = flattenAtmosphereUniform(this.atmosphereParams.toUniform());
      const uniforms: Record<string, unknown> = {
        u_cameraPosition: () => {
          const wc = self.viewer.camera.positionWC;
          return new Cesium.Cartesian3(wc.x * 0.001, wc.y * 0.001, wc.z * 0.001);
        },
        u_altitudeCorrection: () =>
          computeAltitudeCorrectionKm(self.viewer, self.atmosphereParams.bottomRadius),
        u_sunDirection: () => getSunDirectionWc(self.viewer),
        u_groundAlbedo: () => new Cesium.Cartesian3(0.0, 0.0, 0.0),
        u_renderSky: () => (self._renderSky ? 1 : 0),
        u_sunPixelAngle: () => {
          const cam = self.viewer.camera;
          const h =
            (self.viewer.scene.canvas && self.viewer.scene.canvas.clientHeight) || 1080;
          const perspective = cam.frustum as Cesium.PerspectiveFrustum;
          const fov = perspective.fov ?? Math.PI / 3;
          return Math.max(fov / h, 1e-6);
        },
        transmittance_texture: () => self.textures!.transmittanceTexture,
        scattering_texture: () => self.textures!.scatteringTexture,
        single_mie_scattering_texture: () => self.textures!.singleMieScatteringTexture,
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
      uniforms.u_cloudShadowDecode = () => new Cesium.Cartesian4(1.0, 1.0, 1.0, 1.0);
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
      uniforms.u_shadowLengthEnabled = () => 0;
      uniforms.u_shadowLengthScale = () => 1.0;
      uniforms.u_shadowLengthBuffer = () => self._dummyTexture!;
      uniforms.u_applyGroundAtmosphere = () => (self._applyGroundAtmosphere ? 1 : 0);
      uniforms.u_debugTyndall = () => 0;
      uniforms.u_tyndallScale = () => 1.0;
      uniforms.u_bsmTyndallOpticalDepthScale = () => 1.0;
      uniforms.u_bsmGroundOpticalDepthScale = () => 1.0;

      const canHalfFloat =
        !!context.halfFloatingPointTexture && !!context.colorBufferHalfFloat;
      let postHdrPixelDatatype = Cesium.PixelDatatype.UNSIGNED_BYTE;
      if (canHalfFloat) {
        postHdrPixelDatatype = Cesium.PixelDatatype.HALF_FLOAT;
      } else if (context.colorBufferFloat && context.floatingPointTexture) {
        postHdrPixelDatatype = Cesium.PixelDatatype.FLOAT;
      }

      this.stage = new Cesium.PostProcessStage({
        name: "AtmosphereFromThreeGeospatial",
        fragmentShader: fragmentSource,
        uniforms,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: postHdrPixelDatatype,
      });

      if (self._autoAddStage) {
        scene.postProcessStages.add(this.stage);
      }
    })();

    return this._ready;
  }

  destroy(): void {
    if (this.stage && this.viewer.scene.postProcessStages) {
      this.viewer.scene.postProcessStages.remove(this.stage);
      this.stage = null;
    }
    this._ready = null;
  }
}

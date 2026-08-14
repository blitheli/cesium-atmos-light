# Cesium Bruneton 大气散射 + ISS 近景光照

日期：2026-08-13  
状态：已批准（2026-08-13 光照与合成链修订）  
方案：B（原生 Cesium 场景跑通后，用 Bruneton LUT 后处理替换天空/空中透视）

## 1. 目标

从太空近景观察地球边缘大气，随相机与太阳位置呈现 Rayleigh / Mie 散射（白昼蓝气辉、晨昏橙红），前景为 ISS，层次分明。视觉对照 `public/atmos.png` 与 takram `Atmosphere-LightingMask`，不要求像素级一致。

技术栈：Vite + React + TypeScript + Cesium JS `^1.140.0`。

## 2. 范围

### 2.1 本轮要做

- 脚手架：Vite + React + TS，Cesium Viewer 高清渲染（`resolutionScale = devicePixelRatio`）。
- 固定镜头：ISS 在经度 -110°、纬度 45°、高度 408 km；年积日 150、地方平太阳时 17:00。
- 加载 `public/iss-cesium.glb`（不加载 `iss.glb`）。
- HDR、太阳光、ISS 自阴影、`DynamicEnvironmentMapManager` IBL。
- 近地轨道视角保持地球昼夜光照，不使用 Cesium 默认的远距离 lighting fade。
- 阶段 1：Cesium 原生 `SkyAtmosphere` 先出画面。
- 阶段 2：关闭原生天空/地面大气，挂 Bruneton 天空 + 空中透视两个 `PostProcessStage`。
- LUT / shader 失败时回退原生大气，不白屏。

### 2.2 本轮不做

- 体积云、Beer Shadow Map、TAA、镜头光晕。
- 把大气做成 NPM 包（模块边界按可抽包设计，本次不发包）。
- Google Photorealistic 3D Tiles。
- `b787.glb` / `plane-atmos.png`。
- ISS 太阳能板/散热器对日旋转。
- 用 Bruneton 辐照 LUT 替换 Cesium IBL（方案 C）。
- 双渲染器（Cesium + Three.js 合成）。

## 3. 架构

同一 Viewer，大气可插拔：

1. 创建 Viewer → 对时 → ISS → 相机 lookAt → 阴影相机 → 原生大气可见。
2. 异步加载 Bruneton LUT；成功则关闭原生天空/地面大气/fog，加入两个后处理；失败则保持原生大气并提示。

对外只暴露 `enableBrunetonAtmosphere(viewer, options) → Promise<Handle>`。`Handle.destroy()` 移除后处理并恢复原生大气。

### 3.1 目录

```
public/
  iss.glb                  # 仅保留，页面不加载
  iss-cesium.glb           # 页面加载
  atmos.png                # 视觉对照，不参与运行
  atmosphere/
    transmittance.bin
    irradiance.bin
    scattering.bin
    single_mie_scattering.bin
    higher_order_scattering.bin
src/
  main.tsx
  App.tsx
  styles.css
  config/scene.ts
  cesium/createViewer.ts
  cesium/julianDate.ts
  cesium/sunDirection.ts
  iss/addIssEntity.ts
  iss/issShadowCamera.ts
  atmosphere/bruneton/
    index.ts
    enableBrunetonAtmosphere.ts
    AtmospherePostProcess.ts
    AerialPerspectiveEffect.ts
    PrecomputedTexturesLoader.ts
    AtmosphereParameters.ts
    altitudeCorrection.ts
    shaders/               # Vite ?raw 导入
      bruneton/definitions.glsl
      bruneton/common.glsl
      bruneton/runtime.glsl
      sky.glsl
      aerialPerspectiveEffect.frag
```

`atmosphere/bruneton/` 改编自 [yuwoniu03/cesium-clouds-atmosphere](https://github.com/yuwoniu03/cesium-clouds-atmosphere) 的 `src/AtmosphereFromThreeGeospatial/`（MIT，源自 takram three-geospatial）。体积云、dat.gui、`window.Cesium` 全部去掉，改为 `import * as Cesium from 'cesium'`。

## 4. 镜头与时间（不可含糊）

文件：`src/config/scene.ts`、`src/cesium/julianDate.ts`。

| 常量 | 值 |
|---|---|
| `ISS_LONGITUDE` | `-110`（度） |
| `ISS_LATITUDE` | `45`（度） |
| `ISS_HEIGHT_M` | `408000` |
| `SCENE_YEAR` | `2026` |
| `DAY_OF_YEAR` | `150`（非闰年 = 5 月 30 日，地方日） |
| `LOCAL_SOLAR_HOUR` | `17` |
| `CAMERA_RANGE_M` | `250` |
| `CAMERA_HEADING_RAD` | `Cesium.Math.toRadians(40)` |
| `CAMERA_PITCH_RAD` | `Cesium.Math.toRadians(-25)` |
| `CAMERA_ROLL_RAD` | `0` |

地方平太阳时 → UTC：

```
utcHours = LOCAL_SOLAR_HOUR - ISS_LONGITUDE / 15
```

代入：`17 - (-110)/15 = 24.333…` → **2026-05-31T00:20:00.000Z**。

`localSolarToUtcHours(localHour, longitude) = localHour - longitude / 15`（本镜头为 `24 + 1/3`）。

`julianDateForScene()` 必须返回该时刻的 `Cesium.JulianDate`。`issPosition()` 必须返回 `Cartesian3.fromDegrees(-110, 45, 408000)`。

相机：`viewer.camera.lookAt(issPosition, new HeadingPitchRange(heading, pitch, range))`，并 `lookAtTransform(Matrix4.IDENTITY)` 以免被 trackedEntity 抢走。初始值若与 `atmos.png` 构图差得明显，只允许改 heading/pitch/range 三个数，不得改 ISS 位置与时刻。

## 5. Viewer

`createViewer({ container, ionToken?: string }) → Cesium.Viewer`

- `Cesium.Ion.defaultAccessToken`：优先 `ionToken`，否则 `import.meta.env.VITE_CESIUM_ION_TOKEN`。有 token 用 Ion 默认影像；无 token 用 Cesium 内置底图，禁止因缺 token 抛错。
- `skyBox: false`（太空背景黑）。
- 阶段 1：`skyAtmosphere` 默认开；阶段 2 由 Bruneton 模块关掉。
- `shadows: true`，`scene.globe.enableLighting = true`，`scene.highDynamicRange = true`。
- `scene.light` 保持默认 `SunLight`，由 `clock.currentTime` 驱动。不要换成手写方向的 `DirectionalLight`，也不要另算一套太阳星历。
- `scene.globe.depthTestAgainstTerrain = false`（ISS 在轨道，不需要地形遮挡测试）。
- `scene.globe.lightingFadeOutDistance = 0`、`lightingFadeInDistance = 1`。Cesium 默认会在约一万公里以内把昼夜明暗淡出为全亮，这不适用于 408 km 近地轨道镜头。
- `scene.globe.dynamicAtmosphereLighting = true`、`dynamicAtmosphereLightingFromSun = true`，地表与大气统一使用太阳方向。
- 地形：WGS84 椭球即可，不拉 World Terrain（近地轨道看地球边缘不需要高精度 DEM）。
- `resolutionScale = window.devicePixelRatio`，`useBrowserRecommendedResolution = false`。
- 关掉 animation / timeline / geocoder / homeButton / sceneModePicker / navigationHelpButton / baseLayerPicker / fullscreenButton / infoBox / selectionIndicator。
- 构造参数 `shouldAnimate: false`，并 `clock.currentTime = julianDateForScene()`。
- `requestRenderMode = false`（后处理每帧要更新太阳/相机 uniform）。
- `msaaSamples: 4`。若不支持多重采样，Cesium 会自行回退，代码写死 4，不要再写能力探测分支。
- `destroyViewer(viewer)` 调用 `viewer.destroy()`。

## 6. ISS

`addIssEntity(viewer) → Cesium.Entity`

- `model.uri` 仅为 `/iss-cesium.glb`。
- `position`：`issPosition()`。
- `orientation`：该点 ENU 的 `Transforms.headingPitchRollQuaternion(position, HeadingPitchRoll.ZERO)`。
- `model.shadows = ShadowMode.ENABLED`。
- `model.heightReference = HeightReference.NONE`。
- `model.incrementallyLoadTextures = false`。
- 使用 Entity API（`req.md` 要求 ISS entity）。Cesium 1.140 会为 glTF Entity 自动创建 `DynamicEnvironmentMapManager`，保持默认（`enabled = true`，`atmosphereScatteringIntensity = 2.0`），不要改成 Bruneton 辐照，也不要去挖私有 Model 引用。

太阳方向用 Cesium 自带的，阴影、ISS PBR、地球光照、Bruneton 后处理共用同一向量。

`src/cesium/sunDirection.ts` 只做读取，不算星历：

```ts
getSunDirectionWc(viewer: Cesium.Viewer): Cesium.Cartesian3
```

实现：克隆 `viewer.scene.context.uniformState.sunDirectionWC`（单位向量，**指向太阳**，与 `czm_sunDirectionWC` / 默认 `SunLight` 相同）。第一帧若尚未填充，沿用上一帧；初始回退 `(1, 0, 0)`。禁止再调用 `Simon1994PlanetaryPositions` 或手写 ICRF 变换。

`scene.sun` 是太阳广告牌，不是方向源。阶段 2 Bruneton 天空 pass 自己画太阳圆盘，届时设 `scene.sun.show = false`，避免两个太阳。

`bindIssShadowCamera(viewer, issPosition) → () => void`

- 阴影正交半宽固定 `120` m（ISS 解量化后约 112×69×59 m，含余量）。
- 每帧 `scene.preRender`：`s = getSunDirectionWc(viewer)`；阴影相机眼点 `issPosition + s * 400`（太阳一侧），看向 ISS；orthographic 左右/上下 ±120 m，near 1，far 800。构造自定义 `ShadowMap` 并赋给 `scene.shadowMap`，必须设置 `fromLightSource: true`；`false` 只会生成分析纹理，不会让 Model 接收阴影。建议 `darkness = 0.2`、`fadingEnabled = false`。
- 返回函数取消 `preRender` 监听。

## 7. Bruneton 模块接口

```ts
export interface BrunetonAtmosphereOptions {
  assetsBaseUrl?: string; // 默认 '/atmosphere/'
  exposure?: number;      // 默认 1.0，仅缩放新生成的 Bruneton 辐亮度
}

export interface BrunetonAtmosphereHandle {
  destroy(): void;
}

export function enableBrunetonAtmosphere(
  viewer: Cesium.Viewer,
  options?: BrunetonAtmosphereOptions
): Promise<BrunetonAtmosphereHandle>;
```

成功时：

1. `viewer.scene.skyAtmosphere.show = false`
2. `viewer.scene.globe.showGroundAtmosphere = false`
3. `viewer.scene.fog.enabled = false`
4. `viewer.scene.sun.show = false`
5. 向 `viewer.scene.postProcessStages` 按顺序加入：天空 stage，然后空中透视 stage。
6. 每帧更新：`u_cameraPosition`（ECEF 米）、`u_sunDirection`（`getSunDirectionWc(viewer)`，与 Cesium `SunLight` 同一向量）、`u_altitudeCorrection`（与 takram `correctAltitude: true` 相同的椭球修正）、`u_sunPixelAngle`、`u_atmosphereExposure`。
7. 所有云阴影 / shadowLength / 丁达尔 uniform：enabled 置 0，采样器绑 1×1 黑贴图，避免 shader 分支读到未定义纹理。

失败时：不加入任何 stage，不改 `skyAtmosphere.show`，Promise reject 的原因由 `App` 捕获后提示；Viewer 继续用原生大气。

`Handle.destroy()`：移除两个 stage、取消 `preRender` 监听、把 `skyAtmosphere.show`、`globe.showGroundAtmosphere`、`scene.sun.show` 恢复为 `true`（fog 保持 false）。

### 7.1 着色与 tonemap（Cesium 后处理顺序修订）

- Cesium 主 pass 以 HDR 画出地球 + ISS。
- Cesium 1.140 的执行顺序是：主 pass → 内置 PBR Neutral tonemap → 用户 `PostProcessStage`。用户 stage 不能假定自己位于 tonemap 前。
- 天空 stage：深度为无限远的像素计算 Bruneton 线性辐亮度，再执行 `czm_pbrNeutralTonemapping` + `czm_inverseGamma`；几何像素原样转交（`u_applyGroundAtmosphere = 0`）。
- 空中透视 stage：输入已经是 Cesium tonemap 后的显示颜色。先用 `czm_gammaCorrect` 解码到显示线性空间，对场景颜色乘透射率；新增的 Bruneton `inscatter * exposure` 单独经过 `czm_pbrNeutralTonemapping`，相加后用 `czm_inverseGamma` 输出。
- 不再使用移植代码中的 ACES。该方案是基于 Cesium 公共后处理 API 的显示空间近似，避免把已 tonemap 场景色与未映射的线性辐亮度直接相加。
- aerial stage 输出为默认 `UNSIGNED_BYTE` 是有意行为，因为输出已是显示映射后的 LDR；天空 stage 可保留 half-float 中间纹理。
- 长度单位：Cesium 米，LUT 千米，`METER_TO_LENGTH_UNIT = 0.001`（与现有移植一致）。

### 7.2 资源

- GLSL 用 Vite `?raw` 打进 bundle，不运行时 fetch shader。
- `.bin` LUT 放 `public/atmosphere/`，运行时 fetch。来源：cesium-clouds-atmosphere 同名文件（与 three-geospatial 预计算格式相同）。
- 需要 WebGL2（`sampler3D`）。`enableBrunetonAtmosphere` 开头若 `viewer.scene.context.webgl2 === false` 则 reject，走回退。

## 8. App 装配顺序

`App.tsx` 只装配，不写 GLSL。

1. `createViewer`
2. `addIssEntity`
3. `camera.lookAt`（第 4 节参数）
4. `bindIssShadowCamera`
5. `enableBrunetonAtmosphere`（catch 后在画布上叠一条不挡视线的文字提示，例如“Bruneton 大气未加载，已使用 Cesium 原生大气”）
6. unmount：`handle.destroy()` → 取消阴影监听 → `destroyViewer`

无调试 GUI。曝光若与地球/ISS 差一个数量级，只改 `exposure` 默认常量，不加面板。

## 9. 错误处理

| 情况 | 行为 |
|---|---|
| 无 Ion token | 内置底图，控制台 warn 一次 |
| 非 WebGL2 | 原生大气 + 提示 |
| LUT 或 shader 失败 | 原生大气 + 提示 |
| `iss-cesium.glb` 失败 | 地球与大气照常，提示模型未加载 |
| 后处理编译失败 | 移除已加 stage，回退原生大气 + 提示 |

提示是固定在画布一角的 DOM 文本，不是 Cesium infobox。

## 10. 测试

框架：Vitest。不测 WebGL 出图。

必须覆盖：

- `localSolarToUtcHours(17, -110)` 严格等于 `24 + 1/3`。
- `julianDateForScene()` 与 `JulianDate.fromIso8601('2026-05-31T00:20:00.000Z')` 相差 < 1 秒。
- `issPosition()` 与 `Cartesian3.fromDegrees(-110, 45, 408000)` 各分量差 < 1e-3 m。

视觉验收（手工，对照 `public/atmos.png`）：

- 地球边缘有蓝色气辉，晨昏侧偏橙红。
- ISS 在前景，太阳侧亮、背光侧有自阴影。
- 在“正午/傍晚/晨昏”之间切换时，地表明暗必须随太阳方向明显变化。
- Bruneton 与原生模式切换时，地球盘面的透射与内散射必须有可见差异，不能只有边缘变色。
- 高 DPI 下模型边缘无明显马赛克（`resolutionScale` 已生效）。
- 切到 Bruneton 后气辉比原生更接近参考图；失败时仍能看见原生大气和 ISS。

## 11. 已知差距（本轮接受）

- ISS IBL 仍用 Cesium Nishita 大气球谐，不是 Bruneton 辐照 LUT。
- 无完整 takram LightingMask：ISS 仍是 Cesium 前向 PBR + 太阳自阴影，不能复刻参考实现的环境辐照遮蔽；本轮只保证真实可见的直接光自阴影。
- 无世界原点 rebase：ISS 用 Cesium RTC，阴影靠专用正交相机，不把地球原点搬到 ISS。
- 无太阳板对日、无镜头光晕、无体积云。

## 12. 依赖

- `cesium`: `^1.140.0`
- `react` / `react-dom`: `^18.3.0`
- `vite`: `^6.0.0`
- `typescript`: `^5.6.0`
- `vite-plugin-cesium`: `^1.1.0`（用它拷贝 Cesium Workers/Assets，不要手写另一套 copy 插件）
- `vitest`: `^3.0.0`

在 `atmosphere/bruneton/` 保留一份 MIT 归属说明，同时致谢 takram-design-engineering 与 yuwoniu03。

环境变量：`VITE_CESIUM_ION_TOKEN` 可选。

## 13. 回归约束

- `src/renderPipeline.test.ts` 必须检查：`fromLightSource: true`、近地 globe lighting fade、aerial exposure 与显示空间转换、Bruneton 天空显示映射。
- 修改 Cesium 版本时必须重新核对 `PostProcessStageCollection.execute` 的执行顺序；若用户 stage 能公开插入 tonemap 前，才允许恢复全线性合成。
- 阴影开关必须产生可见差异；若只有 ShadowMap 纹理更新而模型不变，优先检查 `fromLightSource` 和 `frameState.shadowState.lightShadowMaps`。

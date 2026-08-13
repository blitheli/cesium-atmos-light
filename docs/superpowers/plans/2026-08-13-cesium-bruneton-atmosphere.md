# Cesium Bruneton 大气 + ISS 近景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Vite + React + Cesium 1.140 对准 takram LightingMask 镜头，先跑通原生大气与 ISS，再换成 Bruneton LUT 后处理天空/空中透视。

**Architecture:** 同一 Viewer：原生 `SkyAtmosphere` 先出画；LUT 加载成功后关闭原生天空/地面大气，按序加入天空与空中透视两个 `PostProcessStage`。ISS 走 Cesium Entity PBR + 默认 `SunLight` + 钉在 ISS 上的正交阴影相机。太阳方向只读 `uniformState.sunDirectionWC`。

**Tech Stack:** cesium ^1.140.0, react ^18.3.0, vite ^6.0.0, typescript ^5.6.0, vite-plugin-cesium ^1.2.23（满足 spec 的 ^1.1.0）, @vitejs/plugin-react, vitest ^3.0.0。Bruneton 改编自 yuwoniu03/cesium-clouds-atmosphere（MIT）。

## 2026-08-13 修订（覆盖下方旧代码片段）

运行时验证发现原计划有三项错误假设，后续 Agent 必须以本节和设计文档 §7.1 为准：

1. Cesium 1.140 先执行内置 PBR Neutral tonemap，再执行用户 `PostProcessStage`。Bruneton stage 不得再把输入当作线性 HDR；天空辐亮度需单独显示映射，aerial 需在显示线性空间合成。
2. ISS 自定义 `ShadowMap` 必须使用 `fromLightSource: true`。旧 Task 5 里的 `false` 只适合分析纹理，Model 不会接收其阴影。
3. 408 km 视角必须设置 `globe.lightingFadeOutDistance = 0`、`lightingFadeInDistance = 1`，否则 Cesium 默认距离淡出会把地球昼夜光照混合回全亮。

回归测试位于 `src/renderPipeline.test.ts`。修改 Task 3、5、7 涉及文件时必须运行该测试，并做 Bruneton/原生、阴影开/关、正午/晨昏三组浏览器对比。

## Global Constraints

- Cesium JS `^1.140.0`；只加载 `/iss-cesium.glb`，不加载 `iss.glb`。
- 镜头：经度 `-110`、纬度 `45`、高度 `408000` m、年积日 150、地方平太阳时 17:00 → UTC `2026-05-31T00:20:00.000Z`。
- `scene.light` 保持默认 `SunLight`；禁止 `Simon1994PlanetaryPositions` 和手写 ICRF。
- `getSunDirectionWc(viewer)` 只克隆 `viewer.scene.context.uniformState.sunDirectionWC`。
- Bruneton 用户 stage 位于 Cesium tonemap 后：天空使用 Cesium PBR Neutral 函数显示映射；aerial 在显示线性空间近似合成。禁止恢复移植代码中的 ACES。
- 不引入体积云、BSM、TAA、镜头光晕、dat.gui、Google 3D Tiles、NPM 发包、太阳能板对日。
- GLSL 用 Vite `?raw`；LUT `.bin` 放 `public/atmosphere/`。
- `enableBrunetonAtmosphere(viewer, options?) → Promise<Handle>`；失败不改 `skyAtmosphere.show`。
- 无 Ion token 时用内置 NaturalEarthII，`console.warn` 一次，禁止抛错。
- 提交信息用英文祈使句；Windows 上用 `git commit -m "..."`（不要 HEREDOC）。

Spec: `docs/superpowers/specs/2026-08-13-cesium-bruneton-atmosphere-design.md`

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html` | 脚手架 |
| `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/vite-env.d.ts` | React 入口与装配 |
| `src/config/scene.ts` | 镜头常量与 `issPosition` |
| `src/cesium/julianDate.ts` | 地方时 → JulianDate |
| `src/cesium/createViewer.ts` | Viewer / 高清 / HDR / 阴影 |
| `src/cesium/sunDirection.ts` | 读取 Cesium 太阳方向 |
| `src/ui/StatusBanner.tsx` | 画布一角 DOM 提示 |
| `src/iss/addIssEntity.ts` | ISS Entity |
| `src/iss/issShadowCamera.ts` | ISS 正交阴影相机 |
| `src/atmosphere/bruneton/*` | LUT、shader、两个 PostProcessStage、enable API |
| `src/config/scene.test.ts`, `src/cesium/julianDate.test.ts` | Vitest |
| `public/atmosphere/*.bin` | Bruneton LUT |

---

### Task 1: Vite + React + Cesium + Vitest 脚手架

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/vite-env.d.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `.gitignore`（若已有则只补 `node_modules`/`dist`/`.env`）

**Interfaces:**
- Consumes: 无
- Produces: `npm run dev` 能打开空白页；`npm test` 能跑 Vitest（尚无测试也要 exit 0 或至少能启动）

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "cesium-atmos-light",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "cesium": "^1.140.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vite-plugin-cesium": "^1.2.23",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 写 Vite / TS 配置**

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [react(), cesium()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cesium Atmos Light</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

declare module "*.frag?raw" {
  const src: string;
  export default src;
}
```

`src/styles.css`:

```css
html,
body,
#root,
.viewer-root {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #000;
}

.status-banner {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 10;
  max-width: 42rem;
  padding: 8px 10px;
  color: #fff;
  font: 13px/1.4 system-ui, sans-serif;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return <div className="viewer-root" />;
}
```

- [ ] **Step 3: 安装并确认 dev/test 能跑**

Run:

```
npm install
npx vitest run
npm run build
```

Expected: `npm install` 成功；`vitest run` 报告 no test files 或 pass；`vite build` 成功。若 vitest 因没有测试文件以非 0 退出，下一步 Task 2 会补测试，本步只要 `npm install` 成功即可。

- [ ] **Step 4: Commit**

```
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/main.tsx src/App.tsx src/styles.css src/vite-env.d.ts
git commit -m "chore: scaffold Vite React Cesium and Vitest"
```

---

### Task 2: 镜头常量与地方时（TDD）

**Files:**
- Create: `src/config/scene.ts`
- Create: `src/config/scene.test.ts`
- Create: `src/cesium/julianDate.ts`
- Create: `src/cesium/julianDate.test.ts`

**Interfaces:**
- Consumes: `cesium` 的 `Cartesian3`, `JulianDate`, `Math.toRadians`
- Produces:
  - `ISS_LONGITUDE: -110`
  - `ISS_LATITUDE: 45`
  - `ISS_HEIGHT_M: 408000`
  - `SCENE_YEAR: 2026`
  - `DAY_OF_YEAR: 150`
  - `LOCAL_SOLAR_HOUR: 17`
  - `CAMERA_RANGE_M: 250`
  - `CAMERA_HEADING_RAD: Cesium.Math.toRadians(40)`
  - `CAMERA_PITCH_RAD: Cesium.Math.toRadians(-25)`
  - `CAMERA_ROLL_RAD: 0`
  - `localSolarToUtcHours(localHour: number, longitude: number): number`
  - `utcIsoForScene(): string` → `'2026-05-31T00:20:00.000Z'`
  - `julianDateForScene(): JulianDate`
  - `issPosition(): Cartesian3`

- [ ] **Step 1: 写失败测试**

`src/cesium/julianDate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { JulianDate } from "cesium";
import { julianDateForScene, localSolarToUtcHours, utcIsoForScene } from "./julianDate";

describe("local solar time", () => {
  it("converts 17:00 at lon -110 to 24 + 1/3 UTC hours", () => {
    expect(localSolarToUtcHours(17, -110)).toBe(24 + 1 / 3);
  });

  it("uses 2026-05-31T00:20:00.000Z", () => {
    expect(utcIsoForScene()).toBe("2026-05-31T00:20:00.000Z");
  });

  it("julianDateForScene is within 1s of that ISO instant", () => {
    const expected = JulianDate.fromIso8601("2026-05-31T00:20:00.000Z");
    const actual = julianDateForScene();
    expect(Math.abs(JulianDate.secondsDifference(actual, expected))).toBeLessThan(1);
  });
});
```

`src/config/scene.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Cartesian3 } from "cesium";
import { issPosition } from "./scene";

describe("issPosition", () => {
  it("matches fromDegrees(-110, 45, 408000) within 1e-3 m", () => {
    const expected = Cartesian3.fromDegrees(-110, 45, 408000);
    const actual = issPosition();
    expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-3);
    expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-3);
    expect(Math.abs(actual.z - expected.z)).toBeLessThan(1e-3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/cesium/julianDate.test.ts src/config/scene.test.ts`

Expected: FAIL，模块不存在。

若 `import { JulianDate } from "cesium"` 在 node 里崩溃，把 `vite.config.ts` 的 `test.environment` 改成 `'jsdom'` 再跑；不要 mock Cesium。

- [ ] **Step 3: 写最小实现**

`src/cesium/julianDate.ts`:

```ts
import { JulianDate } from "cesium";
import { DAY_OF_YEAR, LOCAL_SOLAR_HOUR, ISS_LONGITUDE, SCENE_YEAR } from "../config/scene";

export function localSolarToUtcHours(localHour: number, longitude: number): number {
  return localHour - longitude / 15;
}

export function utcIsoForScene(): string {
  const utcHours = localSolarToUtcHours(LOCAL_SOLAR_HOUR, ISS_LONGITUDE);
  const extraDays = Math.floor(utcHours / 24);
  const hour = utcHours - extraDays * 24;
  const h = Math.floor(hour);
  const minutes = Math.round((hour - h) * 60);
  const start = Date.UTC(SCENE_YEAR, 0, 1);
  const date = new Date(start + (DAY_OF_YEAR - 1 + extraDays) * 86400000);
  date.setUTCHours(h, minutes, 0, 0);
  return date.toISOString().replace(/\.000Z$/, ".000Z");
}

export function julianDateForScene(): JulianDate {
  return JulianDate.fromIso8601(utcIsoForScene());
}
```

`src/config/scene.ts`:

```ts
import { Cartesian3, Math as CesiumMath } from "cesium";

export const ISS_LONGITUDE = -110;
export const ISS_LATITUDE = 45;
export const ISS_HEIGHT_M = 408000;
export const SCENE_YEAR = 2026;
export const DAY_OF_YEAR = 150;
export const LOCAL_SOLAR_HOUR = 17;
export const CAMERA_RANGE_M = 250;
export const CAMERA_HEADING_RAD = CesiumMath.toRadians(40);
export const CAMERA_PITCH_RAD = CesiumMath.toRadians(-25);
export const CAMERA_ROLL_RAD = 0;

export function issPosition(): Cartesian3 {
  return Cartesian3.fromDegrees(ISS_LONGITUDE, ISS_LATITUDE, ISS_HEIGHT_M);
}
```

注意：`julianDate.ts` 从 `scene.ts` 导入常量，`scene.ts` 不要反向导入 `julianDate.ts`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run`

Expected: PASS，3 个 describe 共 4 个 it。若 `utcIsoForScene` 因 `toISOString` 格式差了毫秒，改成手写 `` `${y}-${m}-${d}T${hh}:${mm}:00.000Z` ``，使它**严格等于** `2026-05-31T00:20:00.000Z`。

- [ ] **Step 5: Commit**

```
git add src/config/scene.ts src/config/scene.test.ts src/cesium/julianDate.ts src/cesium/julianDate.test.ts vite.config.ts
git commit -m "feat: add ISS scene time and position helpers"
```

---

### Task 3: createViewer

**Files:**
- Create: `src/cesium/createViewer.ts`
- Modify: `src/App.tsx`
- Modify: `src/ui/StatusBanner.tsx`（本任务创建空壳，Task 4 再用）

**Interfaces:**
- Consumes: `julianDateForScene()`
- Produces:
  - `createViewer(options: { container: HTMLElement; ionToken?: string }): Cesium.Viewer`
  - `destroyViewer(viewer: Cesium.Viewer): void`

- [ ] **Step 1: 实现 createViewer.ts**

```ts
import * as Cesium from "cesium";
import { julianDateForScene } from "./julianDate";
import "cesium/Build/Cesium/Widgets/widgets.css";

export function createViewer(options: {
  container: HTMLElement;
  ionToken?: string;
}): Cesium.Viewer {
  const token = options.ionToken ?? import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  } else {
    console.warn("No VITE_CESIUM_ION_TOKEN; using built-in NaturalEarthII");
  }

  const viewerOptions: Cesium.Viewer.ConstructorOptions = {
    skyBox: false,
    shadows: true,
    shouldAnimate: false,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    msaaSamples: 4,
    requestRenderMode: false,
    useBrowserRecommendedResolution: false,
  };

  if (!token) {
    viewerOptions.baseLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
      ),
    );
  }

  const viewer = new Cesium.Viewer(options.container, viewerOptions);
  viewer.clock.currentTime = julianDateForScene();
  viewer.clock.shouldAnimate = false;
  viewer.resolutionScale = window.devicePixelRatio;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.lightingFadeOutDistance = 0;
  viewer.scene.globe.lightingFadeInDistance = 1;
  viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
  viewer.scene.highDynamicRange = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.fog.enabled = false;
  return viewer;
}

export function destroyViewer(viewer: Cesium.Viewer): void {
  viewer.destroy();
}
```

若 `fromProviderAsync` 类型与 `baseLayer` 不匹配，按 Cesium 1.140 的 `ImageryLayer` 构造方式改，但行为必须是：无 token → NaturalEarthII，有 token → 默认 Ion 影像。不要引入 World Terrain。

- [ ] **Step 2: App 挂上 Viewer**

`src/ui/StatusBanner.tsx`:

```tsx
export function StatusBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="status-banner">{message}</div>;
}
```

`src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { createViewer, destroyViewer } from "./cesium/createViewer";
import { StatusBanner } from "./ui/StatusBanner";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = createViewer({ container });
    return () => {
      destroyViewer(viewer);
    };
  }, []);

  return (
    <div className="viewer-root">
      <div ref={containerRef} className="viewer-root" />
      <StatusBanner message={message} />
    </div>
  );
}
```

`setMessage` 本任务可以暂时未使用；若 `noUnusedLocals` 报错，先写成 `useState<string | null>(null)` 并对 `setMessage` 加 void 引用，或 `eslint-disable` 不要用——改为把 `setMessage` 留到 Task 4。若本步 TS 因未使用报错，把 `const [message, setMessage] = useState<string | null>(null)` 改成 `const message = null`。

- [ ] **Step 3: 手工确认**

Run: `npm run dev`

Expected: 浏览器里能看到点亮的地球、黑色太空、Cesium 原生大气，无 widget 工具条。高 DPI 下地球边缘不应明显糊成 1x 分辨率。

- [ ] **Step 4: Commit**

```
git add src/cesium/createViewer.ts src/App.tsx src/ui/StatusBanner.tsx
git commit -m "feat: create Cesium viewer with HDR lighting and retina resolution"
```

---

### Task 4: ISS entity 与相机 lookAt

**Files:**
- Create: `src/iss/addIssEntity.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `issPosition()`, `CAMERA_*` 常量，`/iss-cesium.glb`
- Produces: `addIssEntity(viewer: Cesium.Viewer): Cesium.Entity`

- [ ] **Step 1: 实现 addIssEntity**

```ts
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
```

- [ ] **Step 2: App 里 lookAt，并处理模型加载失败**

在 `App` 的 `useEffect` 中，`createViewer` 之后：

```ts
import {
  CAMERA_HEADING_RAD,
  CAMERA_PITCH_RAD,
  CAMERA_RANGE_M,
  issPosition,
} from "./config/scene";
import { addIssEntity } from "./iss/addIssEntity";

const entity = addIssEntity(viewer);
entity.model?.readyEvent?.addEventListener?.(() => {
  /* Entity ModelGraphics 可能没有 readyEvent；不要依赖它做 IBL */
});

viewer.camera.lookAt(
  issPosition(),
  new Cesium.HeadingPitchRange(CAMERA_HEADING_RAD, CAMERA_PITCH_RAD, CAMERA_RANGE_M),
);
viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

const errorListener = viewer.scene.renderError.addEventListener(() => {
  setMessage("iss-cesium.glb 未加载");
});
```

不要用 `readyEvent` 配置 `environmentMapManager`。模型加载失败时用下面更稳的方式：若 3 秒后 entity 仍没有包围球/模型，则 `setMessage("iss-cesium.glb 未加载")`：

```ts
const timeoutId = window.setTimeout(() => {
  const model = entity.model;
  if (!model) {
    setMessage("iss-cesium.glb 未加载");
  }
}, 8000);
```

cleanup：`window.clearTimeout(timeoutId)`，`errorListener()` 若 addEventListener 返回 remover 则调用。

- [ ] **Step 3: 手工确认**

Run: `npm run dev`

Expected: ISS 出现在地球边缘前景，约 250 m 视距。构图若与 `public/atmos.png` 差很多，**只改** `CAMERA_HEADING_RAD` / `CAMERA_PITCH_RAD` / `CAMERA_RANGE_M` 三个常量。

- [ ] **Step 4: Commit**

```
git add src/iss/addIssEntity.ts src/App.tsx src/config/scene.ts
git commit -m "feat: place ISS entity and lock camera lookAt"
```

---

### Task 5: Cesium 太阳方向 + ISS 阴影相机

**Files:**
- Create: `src/cesium/sunDirection.ts`
- Create: `src/iss/issShadowCamera.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getSunDirectionWc` 将被 Bruneton 再用
- Produces:
  - `getSunDirectionWc(viewer: Cesium.Viewer): Cesium.Cartesian3`
  - `bindIssShadowCamera(viewer: Cesium.Viewer, issPosition: Cesium.Cartesian3): () => void`

- [ ] **Step 1: sunDirection.ts**

```ts
import * as Cesium from "cesium";

const last = new Cesium.Cartesian3(1, 0, 0);

export function getSunDirectionWc(viewer: Cesium.Viewer): Cesium.Cartesian3 {
  const dir = viewer.scene.context.uniformState.sunDirectionWC;
  if (!dir || Cesium.Cartesian3.equalsEpsilon(dir, Cesium.Cartesian3.ZERO, 0, 1e-12)) {
    return Cesium.Cartesian3.clone(last);
  }
  Cesium.Cartesian3.clone(dir, last);
  return Cesium.Cartesian3.clone(dir);
}
```

禁止 import `Simon1994PlanetaryPositions`。

- [ ] **Step 2: issShadowCamera.ts**

```ts
import * as Cesium from "cesium";
import { getSunDirectionWc } from "../cesium/sunDirection";

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
  lightCamera.frustum = frustum;

  scene.shadowMap = new Cesium.ShadowMap({
    context: scene.context,
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
```

若 `new Cesium.ShadowMap` 因类型/参数在 1.140 报错，改用文档里仍公开的字段（例如 `viewer.shadowMap` 已存在时只替换其 `lightCamera` / 关掉 cascade）。不得改 `node_modules/cesium`。

- [ ] **Step 3: App 里绑定，unmount 时取消**

`createViewer` + `addIssEntity` + `lookAt` 之后：

```ts
const unbindShadow = bindIssShadowCamera(viewer, issPosition());
```

cleanup 顺序：`unbindShadow()` → `destroyViewer(viewer)`。

- [ ] **Step 4: 手工确认**

Run: `npm run dev`

Expected: ISS 太阳侧亮、结构上有自阴影。地球仍是原生大气。

- [ ] **Step 5: Commit**

```
git add src/cesium/sunDirection.ts src/iss/issShadowCamera.ts src/App.tsx
git commit -m "feat: bind ISS shadow camera to Cesium sun direction"
```

---

### Task 6: Vendoring LUT、GLSL、AtmosphereParameters、纹理加载器

**Files:**
- Create: `public/atmosphere/*.bin`（5 个）
- Create: `src/atmosphere/bruneton/shaders/bruneton/definitions.glsl`
- Create: `src/atmosphere/bruneton/shaders/bruneton/common.glsl`
- Create: `src/atmosphere/bruneton/shaders/bruneton/runtime.glsl`
- Create: `src/atmosphere/bruneton/shaders/sky.glsl`
- Create: `src/atmosphere/bruneton/shaders/aerialPerspectiveEffect.frag`
- Create: `src/atmosphere/bruneton/AtmosphereParameters.ts`
- Create: `src/atmosphere/bruneton/PrecomputedTexturesLoader.ts`
- Create: `src/atmosphere/bruneton/altitudeCorrection.ts`
- Create: `src/atmosphere/bruneton/NOTICE.md`

**Interfaces:**
- Consumes: Cesium `Texture` / `Texture3D`
- Produces:
  - `loadPrecomputedTextures(baseUrl: string, context: Cesium.Context): Promise<BrunetonTextures>`
  - `computeAltitudeCorrectionKm(viewer: Cesium.Viewer, bottomRadiusMeters: number): Cesium.Cartesian3`
  - `AtmosphereParameters`, `PRECOMPUTE_CONSTANTS`, `flattenAtmosphereUniform`, `METER_TO_LENGTH_UNIT`

- [ ] **Step 1: 下载 shader 与 LUT**

上游目录：`https://raw.githubusercontent.com/yuwoniu03/cesium-clouds-atmosphere/main/src/AtmosphereFromThreeGeospatial/`

PowerShell:

```
New-Item -ItemType Directory -Force -Path public/atmosphere, src/atmosphere/bruneton/shaders/bruneton | Out-Null
$base = "https://raw.githubusercontent.com/yuwoniu03/cesium-clouds-atmosphere/main/src/AtmosphereFromThreeGeospatial"
Invoke-WebRequest "$base/Shaders/bruneton/definitions.glsl" -OutFile src/atmosphere/bruneton/shaders/bruneton/definitions.glsl
Invoke-WebRequest "$base/Shaders/bruneton/common.glsl" -OutFile src/atmosphere/bruneton/shaders/bruneton/common.glsl
Invoke-WebRequest "$base/Shaders/bruneton/runtime.glsl" -OutFile src/atmosphere/bruneton/shaders/bruneton/runtime.glsl
Invoke-WebRequest "$base/Shaders/sky.glsl" -OutFile src/atmosphere/bruneton/shaders/sky.glsl
Invoke-WebRequest "$base/Shaders/aerialPerspectiveEffect.frag" -OutFile src/atmosphere/bruneton/shaders/aerialPerspectiveEffect.frag
Invoke-WebRequest "$base/assets/transmittance.bin" -OutFile public/atmosphere/transmittance.bin
Invoke-WebRequest "$base/assets/irradiance.bin" -OutFile public/atmosphere/irradiance.bin
Invoke-WebRequest "$base/assets/scattering.bin" -OutFile public/atmosphere/scattering.bin
Invoke-WebRequest "$base/assets/single_mie_scattering.bin" -OutFile public/atmosphere/single_mie_scattering.bin
Invoke-WebRequest "$base/assets/higher_order_scattering.bin" -OutFile public/atmosphere/higher_order_scattering.bin
```

若任一 `.bin` 小于 1 KB 或文件头是 `version https://git-lfs`，改从下面下载同名文件（three-geospatial 官方 LUT，格式相同）：

`https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere/assets/`

- [ ] **Step 2: 改为 Cesium tonemap 后的显示空间合成**

删除移植代码中的 `ACESFilmic`。Cesium 1.140 已在用户 stage 之前完成 PBR Neutral tonemap：

- 天空：`czm_inverseGamma(czm_pbrNeutralTonemapping(radiance * exposure))`。
- aerial：`czm_gammaCorrect(originalColor)` 解码场景显示色，乘 `transmittance`；`inscatter * exposure` 单独执行 `czm_pbrNeutralTonemapping`，相加后 `czm_inverseGamma`。
- aerial frag 必须声明并使用 `u_atmosphereExposure`。
- 不得把 linear inscatter 直接加到 `originalColor`，后者已经是显示映射后的颜色。

- [ ] **Step 3: AtmosphereParameters.ts**

把上游 `AtmosphereParameters.js` 拷到 `src/atmosphere/bruneton/AtmosphereParameters.ts`。只保留并导出：

- `METER_TO_LENGTH_UNIT`
- `PRECOMPUTE_CONSTANTS`
- `flattenAtmosphereUniform`
- `DensityProfileLayer`
- `AtmosphereParameters`（含 `toUniform`、`sunRadianceToRelativeLuminance`、`skyRadianceToRelativeLuminance`、`bottomRadius = 6367720`）

删掉仅用于离线预计算的 `PRECOMPUTE_OUTPUT` / `PRECOMPUTE_PASS_UNIFORMS` / `getPrecomputeDefines`（本项目不跑预计算）。改成 TypeScript：`export class AtmosphereParameters`、`export function flattenAtmosphereUniform(atmosphereUniform: Record<string, unknown>): Record<string, unknown>`。不要改 `bottomRadius`。

- [ ] **Step 4: PrecomputedTexturesLoader.ts**

把上游 `PrecomputedTexturesLoader.js` 写成 TS：`import * as Cesium from "cesium"`，函数签名改为：

```ts
export interface BrunetonTextures {
  transmittanceTexture: Cesium.Texture;
  irradianceTexture: Cesium.Texture;
  scatteringTexture: Cesium.Texture3D;
  singleMieScatteringTexture: Cesium.Texture3D;
  higherOrderScatteringTexture: Cesium.Texture3D;
}

export async function loadPrecomputedTextures(
  baseUrl: string,
  context: Cesium.Context,
): Promise<BrunetonTextures>
```

不要第三个 `Cesium` 参数，不要 `window.Cesium`。float16 解码逻辑原样保留。

- [ ] **Step 5: altitudeCorrection.ts**

```ts
import * as Cesium from "cesium";

export function computeAltitudeCorrectionKm(
  viewer: Cesium.Viewer,
  bottomRadiusMeters: number,
): Cesium.Cartesian3 {
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const cameraPos = viewer.camera.positionWC;
  const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
  if (!carto) return new Cesium.Cartesian3(0, 0, 0);
  const surface = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0, ellipsoid);
  const normal = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
  const center = Cesium.Cartesian3.subtract(
    surface,
    Cesium.Cartesian3.multiplyByScalar(normal, bottomRadiusMeters, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const offsetMeters = Cesium.Cartesian3.negate(center, new Cesium.Cartesian3());
  return new Cesium.Cartesian3(offsetMeters.x * 0.001, offsetMeters.y * 0.001, offsetMeters.z * 0.001);
}
```

- [ ] **Step 6: NOTICE.md**

```
Atmospheric scattering shaders and precomputed LUTs are adapted from:

- takram-design-engineering/three-geospatial (MIT)
- yuwoniu03/cesium-clouds-atmosphere (MIT), which ported the above to Cesium PostProcessStage

See those projects' LICENSE files. This directory omits volumetric clouds, BSM, TAA, and lens flare.
```

- [ ] **Step 7: Commit**

```
git add public/atmosphere src/atmosphere/bruneton
git commit -m "feat: vendor Bruneton LUTs and shaders without ACES display mapping"
```

---

### Task 7: 两个 PostProcessStage + enableBrunetonAtmosphere

**Files:**
- Create: `src/atmosphere/bruneton/AtmospherePostProcess.ts`
- Create: `src/atmosphere/bruneton/AerialPerspectiveEffect.ts`
- Create: `src/atmosphere/bruneton/enableBrunetonAtmosphere.ts`
- Create: `src/atmosphere/bruneton/index.ts`
- Create: `src/atmosphere/bruneton/dummyTexture.ts`

**Interfaces:**
- Consumes: Task 5 的 `getSunDirectionWc`；Task 6 的 LUT/shader/params
- Produces:

```ts
export interface BrunetonAtmosphereOptions {
  assetsBaseUrl?: string; // default '/atmosphere/'
  exposure?: number;      // default 1.0
}

export interface BrunetonAtmosphereHandle {
  destroy(): void;
}

export function enableBrunetonAtmosphere(
  viewer: Cesium.Viewer,
  options?: BrunetonAtmosphereOptions
): Promise<BrunetonAtmosphereHandle>;
```

- [ ] **Step 1: 改编两个 stage 类**

从上游拷 `AtmospherePostProcess.js`、`AerialPerspectiveEffect.js` 为对应 `.ts`，然后**必须**做完下列修改（缺一条算本任务未完成）：

1. `import * as Cesium from "cesium"`，删除所有 `window.Cesium` 和 `dat.gui`。
2. Shader 改为：

```ts
import definitions from "./shaders/bruneton/definitions.glsl?raw";
import common from "./shaders/bruneton/common.glsl?raw";
import runtime from "./shaders/bruneton/runtime.glsl?raw";
import sky from "./shaders/sky.glsl?raw";
import aerialFrag from "./shaders/aerialPerspectiveEffect.frag?raw";
```

删除 `loadShaderSource`。拼接 fragment 的方式与上游 `buildSkyFragmentSource` / Aerial `fragmentSource` 相同。

3. 构造参数增加 `textures?: BrunetonTextures` 与 `autoAddStage = false`。有 `textures` 就不要再 `loadPrecomputedTextures`。
4. `applyGroundAtmosphere` 默认 `false`（天空 stage 几何像素原样转交）。
5. 所有 `u_cloudShadowEnabled` / `u_shadowLengthEnabled` / `u_cloudShadowLengthEnabled` 恒为 `0`。采样器绑 `dummyTexture`（1×1 黑），不要创建 1024 BSM 纹理。
6. `u_sunDirection` 使用 `getSunDirectionWc(this.viewer)`，不要另算星历。
7. `u_altitudeCorrection` 使用 `computeAltitudeCorrectionKm(viewer, atmosphereParams.bottomRadius)`。
8. `u_cameraPosition` 仍为 ECEF 千米：`positionWC * 0.001`。
9. `u_atmosphereExposure` 由构造传入的 `exposure`（默认 1.0）。
10. `init()` 若 `!(context.webgl2)` 或 `context._gl` 不是 `WebGL2RenderingContext`，throw `new Error("WebGL2 required")`。
11. `destroy()` 从 `postProcessStages` 移除自己的 stage。纹理销毁由 `enableBrunetonAtmosphere` 统一做，stage 类不要 `textures.destroy()` 以免双重释放。

- [ ] **Step 2: dummyTexture.ts**

```ts
import * as Cesium from "cesium";

export function makeDummyTexture(context: Cesium.Context): Cesium.Texture {
  return new Cesium.Texture({
    context,
    width: 1,
    height: 1,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
    source: {
      arrayBufferView: new Uint8Array([0, 0, 0, 255]),
      width: 1,
      height: 1,
    },
  });
}
```

- [ ] **Step 3: enableBrunetonAtmosphere.ts（完整实现）**

```ts
import * as Cesium from "cesium";
import { AtmosphereParameters } from "./AtmosphereParameters";
import { loadPrecomputedTextures, type BrunetonTextures } from "./PrecomputedTexturesLoader";
import { AtmospherePostProcess } from "./AtmospherePostProcess";
import { AerialPerspectiveEffect } from "./AerialPerspectiveEffect";
import { makeDummyTexture } from "./dummyTexture";

export interface BrunetonAtmosphereOptions {
  assetsBaseUrl?: string;
  exposure?: number;
}

export interface BrunetonAtmosphereHandle {
  destroy(): void;
}

export async function enableBrunetonAtmosphere(
  viewer: Cesium.Viewer,
  options?: BrunetonAtmosphereOptions,
): Promise<BrunetonAtmosphereHandle> {
  const context = viewer.scene.context;
  if (!context.webgl2) {
    throw new Error("WebGL2 required for Bruneton atmosphere");
  }

  const assetsBaseUrl = options?.assetsBaseUrl ?? "/atmosphere/";
  const exposure = options?.exposure ?? 1.0;
  const atmosphereParams = new AtmosphereParameters();
  const dummy = makeDummyTexture(context);
  const textures: BrunetonTextures = await loadPrecomputedTextures(assetsBaseUrl, context);

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

  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.fog.enabled = false;
  viewer.scene.sun.show = false;
  viewer.scene.postProcessStages.add(sky.stage);
  viewer.scene.postProcessStages.add(aerial.stage);

  return {
    destroy() {
      sky.destroy();
      aerial.destroy();
      dummy.destroy();
      destroyTextures(textures);
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.sun.show = true;
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
```

`index.ts`:

```ts
export {
  enableBrunetonAtmosphere,
  type BrunetonAtmosphereHandle,
  type BrunetonAtmosphereOptions,
} from "./enableBrunetonAtmosphere";
```

失败路径：`enableBrunetonAtmosphere` 在加入 stage **之前** throw。App 捕获后不得看到 `skyAtmosphere.show === false`。若 stage 已 add 随后编译失败，按 spec 移除已加 stage 并恢复 `skyAtmosphere.show = true` 再 throw。

- [ ] **Step 4: 编译确认**

Run: `npx vite build`

Expected: 成功。若 GLSL `?raw` 类型报错，检查 `src/vite-env.d.ts`。若 Cesium `Texture3D` 不存在，使用 1.140 里等价的 3D 纹理 API（上游 loader 已用 `Cesium.Texture3D`）。

- [ ] **Step 5: Commit**

```
git add src/atmosphere/bruneton
git commit -m "feat: add Bruneton sky and aerial-perspective post-process stages"
```

---

### Task 8: App 接入 Bruneton 与回退提示

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `enableBrunetonAtmosphere`, `StatusBanner`, Task 3–5 的装配顺序
- Produces: 完整页面

- [ ] **Step 1: 按 spec 第 8 节装配**

`App.tsx` 的 `useEffect` 必须按这个顺序，且只装配不写 GLSL：

1. `createViewer`
2. `addIssEntity`
3. `camera.lookAt` + `lookAtTransform(IDENTITY)`
4. `bindIssShadowCamera`
5. `enableBrunetonAtmosphere(viewer).catch((err) => { console.error(err); setMessage("Bruneton 大气未加载，已使用 Cesium 原生大气"); })`
6. cleanup：若 handle 已有则 `handle.destroy()` → `unbindShadow()` → `destroyViewer(viewer)`

`enableBrunetonAtmosphere` 是 async：用 `let handle: BrunetonAtmosphereHandle | undefined` 和 `let cancelled = false`。resolve 后若 `cancelled` 立即 `handle.destroy()`。非 WebGL2、LUT 404、shader 编译失败都走同一句中文提示，不要白屏，不要改已经显示的地球和 ISS。

完整 `App.tsx`：

```tsx
import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { createViewer, destroyViewer } from "./cesium/createViewer";
import {
  CAMERA_HEADING_RAD,
  CAMERA_PITCH_RAD,
  CAMERA_RANGE_M,
  issPosition,
} from "./config/scene";
import { addIssEntity } from "./iss/addIssEntity";
import { bindIssShadowCamera } from "./iss/issShadowCamera";
import {
  enableBrunetonAtmosphere,
  type BrunetonAtmosphereHandle,
} from "./atmosphere/bruneton";
import { StatusBanner } from "./ui/StatusBanner";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let handle: BrunetonAtmosphereHandle | undefined;
    let unbindShadow: (() => void) | undefined;
    const viewer = createViewer({ container });
    addIssEntity(viewer);
    viewer.camera.lookAt(
      issPosition(),
      new Cesium.HeadingPitchRange(
        CAMERA_HEADING_RAD,
        CAMERA_PITCH_RAD,
        CAMERA_RANGE_M,
      ),
    );
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    unbindShadow = bindIssShadowCamera(viewer, issPosition());

    const modelTimer = window.setTimeout(() => {
      const found = viewer.entities.values.some((e) => e.name === "ISS" && e.model);
      if (!found) setMessage("iss-cesium.glb 未加载");
    }, 8000);

    enableBrunetonAtmosphere(viewer)
      .then((h) => {
        if (cancelled) {
          h.destroy();
          return;
        }
        handle = h;
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) {
          setMessage("Bruneton 大气未加载，已使用 Cesium 原生大气");
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(modelTimer);
      handle?.destroy();
      unbindShadow?.();
      destroyViewer(viewer);
    };
  }, []);

  return (
    <div className="viewer-root">
      <div ref={containerRef} className="viewer-root" />
      <StatusBanner message={message} />
    </div>
  );
}
```

- [ ] **Step 2: 跑测试与构建**

Run:

```
npx vitest run
npm run build
npm run dev
```

Expected: 测试全绿；build 成功；dev 里 LUT 成功时原生气辉被 Bruneton 替换，晨昏偏橙红、白昼蓝边；ISS 仍在前景且有自阴影。失败时地球+ISS+原生大气仍在，左下角有提示。

对照 `public/atmos.png` 做视觉验收（不要求像素级一致）。曝光若整体过暗/过亮，只改 `enableBrunetonAtmosphere(viewer, { exposure: N })` 的 `N`，不加 GUI。

- [ ] **Step 3: Commit**

```
git add src/App.tsx
git commit -m "feat: enable Bruneton atmosphere with native fallback"
```

---

## Self-review (spec coverage)

| Spec 节 | Task |
|---|---|
| 脚手架 / Cesium ≥1.140 / retina | 1, 3 |
| 镜头与 `2026-05-31T00:20:00.000Z` | 2 |
| Viewer HDR、SunLight、无 World Terrain、无 token 底图 | 3 |
| ISS entity、`iss-cesium.glb`、lookAt | 4 |
| `getSunDirectionWc`、阴影相机、隐藏 `scene.sun` | 5, 7 |
| Bruneton 两 pass、显示空间兼容合成、无 ACES、无云 | 6, 7 |
| App 装配顺序与回退文案 | 8 |
| Vitest 三条 | 2 |
| NOTICE / MIT | 6 |
| 不做：云、NPM、3D Tiles、太阳板、方案 C | 全局约束 |

类型名核对：`enableBrunetonAtmosphere` / `BrunetonAtmosphereHandle` / `BrunetonAtmosphereOptions` / `getSunDirectionWc` / `bindIssShadowCamera` / `issPosition` / `julianDateForScene` / `localSolarToUtcHours` 与 spec 一致。

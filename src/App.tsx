import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { createViewer, destroyViewer } from "./cesium/createViewer";
import { julianDateForLocalHour } from "./cesium/julianDate";
import { issPosition } from "./config/scene";
import {
  DEFAULT_TIME_PRESET_ID,
  DEFAULT_VIEW_PRESET_ID,
  VIEW_PRESETS,
  type AtmosphereMode,
  type TimePreset,
  type ViewPreset,
} from "./config/presets";
import { addIssEntity } from "./iss/addIssEntity";
import { bindIssShadowCamera } from "./iss/issShadowCamera";
import {
  enableBrunetonAtmosphere,
  type BrunetonAtmosphereHandle,
} from "./atmosphere/bruneton";
import { StatusBanner } from "./ui/StatusBanner";
import { ControlPanel } from "./ui/ControlPanel";

function configureIssOrbitControls(viewer: Cesium.Viewer): void {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableRotate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableTranslate = false;
  controller.enableLook = false;
  // Distances are relative to the lookAt target (ISS), not Earth center.
  controller.minimumZoomDistance = 40;
  controller.maximumZoomDistance = 8000;
}

/** Zoom/orbit around ISS. Keep lookAt active so mouse rotate + scroll zoom work. */
function applyViewPreset(viewer: Cesium.Viewer, preset: ViewPreset): void {
  viewer.trackedEntity = undefined;
  viewer.camera.lookAt(
    issPosition(),
    new Cesium.HeadingPitchRange(
      preset.headingRad,
      preset.pitchRad,
      preset.rangeM,
    ),
  );
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const issRef = useRef<Cesium.Entity | null>(null);
  const brunetonRef = useRef<BrunetonAtmosphereHandle | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [brunetonReady, setBrunetonReady] = useState(false);
  const [atmosphereMode, setAtmosphereMode] =
    useState<AtmosphereMode>("native");
  const [timePresetId, setTimePresetId] = useState(DEFAULT_TIME_PRESET_ID);
  const [viewPresetId, setViewPresetId] = useState(DEFAULT_VIEW_PRESET_ID);
  const [shadows, setShadows] = useState(true);
  const [hdr, setHdr] = useState(true);
  const [issVisible, setIssVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let unbindShadow: (() => void) | undefined;
    const viewer = createViewer({ container });
    viewerRef.current = viewer;
    const entity = addIssEntity(viewer);
    issRef.current = entity;
    configureIssOrbitControls(viewer);

    const defaultView =
      VIEW_PRESETS.find((p) => p.id === DEFAULT_VIEW_PRESET_ID) ??
      VIEW_PRESETS[0];
    applyViewPreset(viewer, defaultView);
    unbindShadow = bindIssShadowCamera(viewer, issPosition());

    const modelTimer = window.setTimeout(() => {
      const found = viewer.entities.values.some(
        (e) => e.name === "ISS" && e.model,
      );
      if (!found) setMessage("iss-cesium.glb 未加载");
    }, 8000);

    enableBrunetonAtmosphere(viewer)
      .then((h) => {
        if (cancelled) {
          h.destroy();
          return;
        }
        brunetonRef.current = h;
        setBrunetonReady(true);
        setAtmosphereMode("bruneton");
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) {
          setBrunetonReady(false);
          setAtmosphereMode("native");
          setMessage("Bruneton 大气未加载，已使用 Cesium 原生大气");
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(modelTimer);
      brunetonRef.current?.destroy();
      brunetonRef.current = null;
      unbindShadow?.();
      viewerRef.current = null;
      issRef.current = null;
      destroyViewer(viewer);
    };
  }, []);

  const onAtmosphereMode = (mode: AtmosphereMode) => {
    const handle = brunetonRef.current;
    if (mode === "bruneton") {
      if (!handle) return;
      handle.setEnabled(true);
      setAtmosphereMode("bruneton");
      return;
    }
    handle?.setEnabled(false);
    setAtmosphereMode("native");
  };

  const onTimePreset = (preset: TimePreset) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.currentTime = julianDateForLocalHour(preset.localHour);
    setTimePresetId(preset.id);
  };

  const onViewPreset = (preset: ViewPreset) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    applyViewPreset(viewer, preset);
    setViewPresetId(preset.id);
  };

  const onShadows = (value: boolean) => {
    const viewer = viewerRef.current;
    if (viewer?.shadowMap) {
      viewer.shadowMap.enabled = value;
    }
    setShadows(value);
  };

  const onHdr = (value: boolean) => {
    const viewer = viewerRef.current;
    if (viewer) {
      viewer.scene.highDynamicRange = value;
    }
    setHdr(value);
  };

  const onIssVisible = (value: boolean) => {
    const entity = issRef.current;
    if (entity) {
      entity.show = value;
    }
    setIssVisible(value);
  };

  return (
    <div className="viewer-root">
      <div ref={containerRef} className="viewer-root" />
      <ControlPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        atmosphereMode={atmosphereMode}
        brunetonReady={brunetonReady}
        onAtmosphereMode={onAtmosphereMode}
        timePresetId={timePresetId}
        onTimePreset={onTimePreset}
        viewPresetId={viewPresetId}
        onViewPreset={onViewPreset}
        shadows={shadows}
        hdr={hdr}
        issVisible={issVisible}
        onShadows={onShadows}
        onHdr={onHdr}
        onIssVisible={onIssVisible}
      />
      <StatusBanner message={message} />
    </div>
  );
}

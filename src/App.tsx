import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { createViewer, destroyViewer } from "./cesium/createViewer";
import { julianDateForLocalHour } from "./cesium/julianDate";
import {
  applyViewPreset,
  bindIssWheelZoom,
  configureIssOrbitControls,
} from "./cesium/issCamera";
import {
  DEFAULT_TIME_PRESET_ID,
  DEFAULT_VIEW_PRESET_ID,
  VIEW_PRESETS,
  type AtmosphereMode,
  type TimePreset,
  type ViewPreset,
} from "./config/presets";
import {
  enableBrunetonAtmosphere,
  type BrunetonAtmosphereHandle,
} from "./atmosphere/bruneton";
import { StatusBanner } from "./ui/StatusBanner";
import { ControlPanel } from "./ui/ControlPanel";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const brunetonRef = useRef<BrunetonAtmosphereHandle | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [brunetonReady, setBrunetonReady] = useState(false);
  const [atmosphereMode, setAtmosphereMode] =
    useState<AtmosphereMode>("native");
  const [timePresetId, setTimePresetId] = useState(DEFAULT_TIME_PRESET_ID);
  const [viewPresetId, setViewPresetId] = useState(DEFAULT_VIEW_PRESET_ID);
  const [lighting, setLighting] = useState(true);
  const [hdr, setHdr] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const viewer = createViewer({ container });
    viewerRef.current = viewer;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__viewer = viewer;
    }
    configureIssOrbitControls(viewer);
    const unbindWheelZoom = bindIssWheelZoom(viewer);

    const defaultView =
      VIEW_PRESETS.find((p) => p.id === DEFAULT_VIEW_PRESET_ID) ??
      VIEW_PRESETS[0];
    applyViewPreset(viewer, defaultView);

    enableBrunetonAtmosphere(viewer)
      .then((h) => {
        if (cancelled) {
          h.destroy();
          return;
        }
        brunetonRef.current = h;
        setBrunetonReady(true);
        setAtmosphereMode("bruneton");
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>).__atmos = h;
        }
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
      unbindWheelZoom();
      brunetonRef.current?.destroy();
      brunetonRef.current = null;
      viewerRef.current = null;
      destroyViewer(viewer);
    };
  }, []);

  const onAtmosphereMode = (mode: AtmosphereMode) => {
    const handle = brunetonRef.current;
    const viewer = viewerRef.current;
    if (mode === "bruneton") {
      if (!handle) return;
      handle.setEnabled(true);
      setAtmosphereMode("bruneton");
      return;
    }
    handle?.setEnabled(false);
    if (viewer) {
      viewer.scene.globe.enableLighting = lighting;
    }
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

  const onLighting = (value: boolean) => {
    const viewer = viewerRef.current;
    if (viewer && atmosphereMode !== "bruneton") {
      viewer.scene.globe.enableLighting = value;
    }
    setLighting(value);
  };

  const onHdr = (value: boolean) => {
    const viewer = viewerRef.current;
    if (viewer) {
      viewer.scene.highDynamicRange = value;
    }
    setHdr(value);
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
        lighting={lighting}
        hdr={hdr}
        onLighting={onLighting}
        onHdr={onHdr}
      />
      <StatusBanner message={message} />
    </div>
  );
}

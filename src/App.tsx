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

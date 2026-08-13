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
import { StatusBanner } from "./ui/StatusBanner";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = createViewer({ container });
    const entity = addIssEntity(viewer);

    viewer.camera.lookAt(
      issPosition(),
      new Cesium.HeadingPitchRange(
        CAMERA_HEADING_RAD,
        CAMERA_PITCH_RAD,
        CAMERA_RANGE_M,
      ),
    );
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    const errorListener = viewer.scene.renderError.addEventListener(() => {
      setMessage("iss-cesium.glb 未加载");
    });

    const timeoutId = window.setTimeout(() => {
      const model = entity.model;
      if (!model) {
        setMessage("iss-cesium.glb 未加载");
      }
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
      errorListener();
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

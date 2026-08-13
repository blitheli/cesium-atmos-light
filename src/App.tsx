import { useEffect, useRef } from "react";
import { createViewer, destroyViewer } from "./cesium/createViewer";
import { StatusBanner } from "./ui/StatusBanner";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const message = null;

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

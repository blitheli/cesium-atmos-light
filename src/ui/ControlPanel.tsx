import type {
  AtmosphereMode,
  TimePreset,
  ViewPreset,
} from "../config/presets";
import { TIME_PRESETS, VIEW_PRESETS } from "../config/presets";
import "./controlPanel.css";

export interface ControlPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atmosphereMode: AtmosphereMode;
  brunetonReady: boolean;
  onAtmosphereMode: (mode: AtmosphereMode) => void;
  timePresetId: string;
  onTimePreset: (preset: TimePreset) => void;
  viewPresetId: string;
  onViewPreset: (preset: ViewPreset) => void;
  lighting: boolean;
  hdr: boolean;
  onLighting: (value: boolean) => void;
  onHdr: (value: boolean) => void;
}

export function ControlPanel(props: ControlPanelProps) {
  const {
    open,
    onOpenChange,
    atmosphereMode,
    brunetonReady,
    onAtmosphereMode,
    timePresetId,
    onTimePreset,
    viewPresetId,
    onViewPreset,
    lighting,
    hdr,
    onLighting,
    onHdr,
  } = props;

  return (
    <div className="control-panel">
      <button
        type="button"
        className="control-panel__toggle"
        onClick={() => onOpenChange(!open)}
      >
        {open ? "收起控制" : "控制"}
      </button>
      {open && (
        <div className="control-panel__body">
          <section className="control-panel__section">
            <h3 className="control-panel__label">大气</h3>
            <div className="control-panel__row">
              <button
                type="button"
                className={`control-panel__btn${atmosphereMode === "bruneton" ? " is-active" : ""}`}
                disabled={!brunetonReady}
                onClick={() => onAtmosphereMode("bruneton")}
              >
                Bruneton
              </button>
              <button
                type="button"
                className={`control-panel__btn${atmosphereMode === "native" ? " is-active" : ""}`}
                onClick={() => onAtmosphereMode("native")}
              >
                原生
              </button>
            </div>
          </section>

          <section className="control-panel__section">
            <h3 className="control-panel__label">时间</h3>
            <div className="control-panel__row">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`control-panel__btn${timePresetId === preset.id ? " is-active" : ""}`}
                  onClick={() => onTimePreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="control-panel__section">
            <h3 className="control-panel__label">视角</h3>
            <div className="control-panel__row">
              {VIEW_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`control-panel__btn${viewPresetId === preset.id ? " is-active" : ""}`}
                  onClick={() => onViewPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="control-panel__section">
            <h3 className="control-panel__label">渲染</h3>
            <div className="control-panel__switches">
              <label className="control-panel__switch">
                <input
                  type="checkbox"
                  checked={lighting}
                  onChange={(e) => onLighting(e.target.checked)}
                />
                光照
              </label>
              <label className="control-panel__switch">
                <input
                  type="checkbox"
                  checked={hdr}
                  onChange={(e) => onHdr(e.target.checked)}
                />
                HDR
              </label>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

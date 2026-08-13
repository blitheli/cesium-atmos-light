import { Math as CesiumMath } from "cesium";

export type AtmosphereMode = "bruneton" | "native";

export interface TimePreset {
  id: string;
  label: string;
  localHour: number;
}

export interface ViewPreset {
  id: string;
  label: string;
  headingRad: number;
  pitchRad: number;
  rangeM: number;
}

export const TIME_PRESETS: TimePreset[] = [
  { id: "noon", label: "正午", localHour: 12 },
  { id: "evening", label: "傍晚", localHour: 17 },
  { id: "terminator", label: "晨昏", localHour: 18.5 },
];

export const VIEW_PRESETS: ViewPreset[] = [
  {
    id: "close",
    label: "近景",
    headingRad: CesiumMath.toRadians(40),
    pitchRad: CesiumMath.toRadians(-25),
    rangeM: 250,
  },
  {
    id: "station",
    label: "整站",
    headingRad: CesiumMath.toRadians(20),
    pitchRad: CesiumMath.toRadians(-15),
    rangeM: 450,
  },
  {
    id: "limb",
    label: "地球边缘",
    headingRad: CesiumMath.toRadians(70),
    pitchRad: CesiumMath.toRadians(-35),
    rangeM: 180,
  },
];

export const DEFAULT_TIME_PRESET_ID = "evening";
export const DEFAULT_VIEW_PRESET_ID = "close";

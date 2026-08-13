import { JulianDate } from "cesium";
import {
  DAY_OF_YEAR,
  LOCAL_SOLAR_HOUR,
  ISS_LONGITUDE,
  SCENE_YEAR,
} from "../config/scene";

export function localSolarToUtcHours(
  localHour: number,
  longitude: number,
): number {
  return localHour - longitude / 15;
}

export function utcIsoForLocalHour(localHour: number): string {
  const utcHours = localSolarToUtcHours(localHour, ISS_LONGITUDE);
  const extraDays = Math.floor(utcHours / 24);
  const hour = utcHours - extraDays * 24;
  const h = Math.floor(hour);
  const minutes = Math.round((hour - h) * 60);
  const start = Date.UTC(SCENE_YEAR, 0, 1);
  const date = new Date(start + (DAY_OF_YEAR - 1 + extraDays) * 86400000);
  date.setUTCHours(h, minutes, 0, 0);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:00.000Z`;
}

export function utcIsoForScene(): string {
  return utcIsoForLocalHour(LOCAL_SOLAR_HOUR);
}

export function julianDateForLocalHour(localHour: number): JulianDate {
  return JulianDate.fromIso8601(utcIsoForLocalHour(localHour));
}

export function julianDateForScene(): JulianDate {
  return julianDateForLocalHour(LOCAL_SOLAR_HOUR);
}

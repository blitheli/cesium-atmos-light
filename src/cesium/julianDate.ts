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

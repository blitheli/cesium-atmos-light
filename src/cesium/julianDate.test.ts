import { describe, expect, it } from "vitest";
import { JulianDate } from "cesium";
import {
  julianDateForLocalHour,
  julianDateForScene,
  localSolarToUtcHours,
  utcIsoForLocalHour,
  utcIsoForScene,
} from "./julianDate";

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

  it("julianDateForLocalHour(12) matches noon ISO", () => {
    expect(utcIsoForLocalHour(12)).toBe("2026-05-30T19:20:00.000Z");
    const expected = JulianDate.fromIso8601("2026-05-30T19:20:00.000Z");
    const actual = julianDateForLocalHour(12);
    expect(Math.abs(JulianDate.secondsDifference(actual, expected))).toBeLessThan(1);
  });

  it("julianDateForLocalHour(18.5) matches terminator ISO", () => {
    expect(utcIsoForLocalHour(18.5)).toBe("2026-05-31T01:50:00.000Z");
  });
});

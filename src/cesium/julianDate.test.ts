import { describe, expect, it } from "vitest";
import { JulianDate } from "cesium";
import { julianDateForScene, localSolarToUtcHours, utcIsoForScene } from "./julianDate";

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
});

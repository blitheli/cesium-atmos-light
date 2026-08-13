import { describe, expect, it } from "vitest";
import { Cartesian3 } from "cesium";
import { issPosition } from "./scene";

describe("issPosition", () => {
  it("matches fromDegrees(-110, 45, 408000) within 1e-3 m", () => {
    const expected = Cartesian3.fromDegrees(-110, 45, 408000);
    const actual = issPosition();
    expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-3);
    expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-3);
    expect(Math.abs(actual.z - expected.z)).toBeLessThan(1e-3);
  });
});

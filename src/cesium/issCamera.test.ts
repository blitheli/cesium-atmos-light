import { Cartesian3 } from "cesium";
import { describe, expect, it } from "vitest";
import {
  ISS_MAX_RANGE_M,
  ISS_MIN_RANGE_M,
  scaleIssCameraRange,
  setIssCameraRange,
} from "./issCamera";

describe("scaleIssCameraRange", () => {
  it("scroll down increases range (zoom out)", () => {
    expect(scaleIssCameraRange(250, 100)).toBeGreaterThan(250);
  });

  it("scroll up decreases range (zoom in)", () => {
    expect(scaleIssCameraRange(250, -100)).toBeLessThan(250);
  });

  it("clamps to the ISS near/far range", () => {
    expect(scaleIssCameraRange(ISS_MIN_RANGE_M, -5000)).toBe(ISS_MIN_RANGE_M);
    expect(scaleIssCameraRange(ISS_MAX_RANGE_M, 5000)).toBe(ISS_MAX_RANGE_M);
  });
});

describe("setIssCameraRange", () => {
  it("scales the lookAt-frame position to the requested range", () => {
    const camera = {
      position: new Cartesian3(0, 0, 250),
    };
    setIssCameraRange(camera, 500);
    expect(Cartesian3.magnitude(camera.position)).toBeCloseTo(500, 6);
    expect(camera.position.z).toBeCloseTo(500, 6);
  });
});

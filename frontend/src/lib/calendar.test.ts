import { describe, expect, it } from "vitest";

import {
  expandWeekRange,
  isWeekInRange,
  resolveWeekIdentifier,
} from "./calendar";

describe("expandWeekRange", () => {
  it("returns a single week when begin and end match", () => {
    expect(expandWeekRange(12, 12)).toEqual([12]);
  });

  it("returns a continuous range for increasing weeks", () => {
    expect(expandWeekRange(5, 7)).toEqual([5, 6, 7]);
  });

  it("wraps around the year when the end is smaller than the start", () => {
    expect(expandWeekRange(52, 3)).toEqual([52, 53, 1, 2, 3]);
  });

  it("ignores invalid inputs", () => {
    expect(expandWeekRange(undefined, undefined)).toEqual([]);
    expect(expandWeekRange(0, 60)).toEqual([]);
  });
});

describe("isWeekInRange", () => {
  it("detects weeks within a non-wrapping range", () => {
    expect(isWeekInRange(8, 5, 10)).toBe(true);
    expect(isWeekInRange(4, 5, 10)).toBe(false);
  });

  it("detects weeks within a wrapping range", () => {
    expect(isWeekInRange(2, 46, 5)).toBe(true);
    expect(isWeekInRange(30, 46, 5)).toBe(false);
  });
});

describe("resolveWeekIdentifier", () => {
  it("normaliseert week 53 naar de kalenderweek waarin de datum valt", () => {
    const resolved = resolveWeekIdentifier(53, { schooljaar: "2023/2024" });
    expect(resolved).toEqual({ week: 1, isoYear: 2024 });
  });

  it("houdt rekening met kandidaatdatums bij het normaliseren", () => {
    const resolved = resolveWeekIdentifier(52, {
      schooljaar: "2023/2024",
      candidateDates: ["2024-01-05"],
    });
    expect(resolved).toEqual({ week: 1, isoYear: 2024 });
  });
});

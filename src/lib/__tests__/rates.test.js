import { describe, it, expect } from "vitest";
import { makeEffectiveRates } from "../rates.js";

describe("makeEffectiveRates", () => {
  it("flattens a rate-table array (key + defaultRate) into defaults", () => {
    const eff = makeEffectiveRates([
      { key: "a", defaultRate: 10 },
      { key: "b", defaultRate: 20 },
    ]);
    expect(eff()).toEqual({ a: 10, b: 20 });
  });

  it("accepts an already-flattened {key: rate} map", () => {
    const eff = makeEffectiveRates({ a: 10, b: 20 });
    expect(eff()).toEqual({ a: 10, b: 20 });
  });

  it("applies a single override layer, override winning", () => {
    const eff = makeEffectiveRates({ a: 10, b: 20 });
    expect(eff({ a: 99 })).toEqual({ a: 99, b: 20 });
  });

  it("layers multiple overrides in order — later layers win", () => {
    const eff = makeEffectiveRates({ a: 10, b: 20, c: 30 });
    expect(eff({ a: 1, b: 2 }, { b: 99 })).toEqual({ a: 1, b: 99, c: 30 });
  });

  it("treats null/undefined layers as no-ops", () => {
    const eff = makeEffectiveRates({ a: 10 });
    expect(eff(undefined)).toEqual({ a: 10 });
    expect(eff(null, { a: 5 })).toEqual({ a: 5 });
  });

  it("does not mutate the defaults across calls", () => {
    const eff = makeEffectiveRates({ a: 10 });
    eff({ a: 999 });
    expect(eff()).toEqual({ a: 10 });
  });
});

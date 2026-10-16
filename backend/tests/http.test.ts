import { describe, it, expect } from "vitest";
import { extractRows, flattenKeys, buildSourceHeaders, maskSecret, resolveRow } from "../src/http";
import { computeNextRun } from "../src/scheduler";
import { heuristicMappings } from "../src/ai";

describe("extractRows", () => {
  it("handles root arrays", () => {
    const r = extractRows([{ a: 1 }, { a: 2 }], "");
    expect(r.rows.length).toBe(2);
  });
  it("follows data_path", () => {
    const r = extractRows({ data: { items: [{ x: 1 }] } }, "data.items");
    expect(r.rows).toEqual([{ x: 1 }]);
  });
  it("errors on missing path", () => {
    const r = extractRows({ a: 1 }, "nope.deeper");
    expect(r.error).toMatch(/data_path/);
  });
  it("wraps single objects", () => {
    expect(extractRows({ a: 1 }, "").rows).toEqual([{ a: 1 }]);
  });
  it("rejects scalars", () => {
    expect(extractRows("hi", "").error).toBeDefined();
  });
});

describe("flattenKeys/resolveRow", () => {
  it("exposes nested fields as dot paths", () => {
    const r = resolveRow({ name: "x", address: { city: "Pune", geo: { lat: "1" } } });
    expect(r["address.city"]).toBe("Pune");
    expect(r.name).toBe("x");
  });
  it("flattenKeys lists nested leaves", () => {
    expect(flattenKeys({ a: 1, b: { c: 2 } })).toContain("b.c");
  });
});

describe("buildSourceHeaders", () => {
  it("bearer", () => {
    expect(buildSourceHeaders("https://x", { auth_type: "bearer", auth_secret: "abc" }).Authorization).toBe("Bearer abc");
  });
  it("api key default + custom", () => {
    expect(buildSourceHeaders("https://x", { auth_type: "api_key", auth_secret: "k" })["X-API-Key"]).toBe("k");
    expect(buildSourceHeaders("https://x", { auth_type: "api_key", auth_secret: "X-Token: k" })["X-Token"]).toBe("k");
  });
  it("none adds nothing secret", () => {
    const h = buildSourceHeaders("https://x", { auth_type: "none", auth_secret: "abc" });
    expect(h.Authorization).toBeUndefined();
  });
  it("maskSecret never leaks", () => {
    expect(maskSecret("supersecretvalue")).toBe("••••alue");
    expect(maskSecret("")).toBe("");
  });
});

describe("computeNextRun", () => {
  it("manual → null", () => {
    expect(computeNextRun("manual")).toBeNull();
  });
  it("intervals add correctly", () => {
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    expect(computeNextRun("every_5m", base)).toBe(new Date(base + 300000).toISOString());
    expect(computeNextRun("daily", base)).toBe(new Date(base + 86400000).toISOString());
  });
});

describe("heuristicMappings", () => {
  it("maps common fields", () => {
    const s = heuristicMappings(["full_name", "email", "plan", "address.city", "zzz"]);
    const byTarget = Object.fromEntries(s.map((m) => [m.target, m.source]));
    expect(byTarget.name).toBe("full_name");
    expect(byTarget.email).toBe("email");
    expect(byTarget.city).toBeUndefined(); // city not in synonym targets
    expect(s.length).toBe(3);
  });
});

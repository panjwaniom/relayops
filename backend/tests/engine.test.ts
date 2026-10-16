import { describe, it, expect } from "vitest";
import { parseCsv, applyMappingAndTransforms, validateRecord, processRows, sha1 } from "../src/engine";

describe("csv", () => {
  it("parses quoted csv", () => {
    const rows = parseCsv('a,b\n"1,2",3\n4,5');
    expect(rows).toEqual([{ a: "1,2", b: "3" }, { a: "4", b: "5" }]);
  });
});

describe("transforms", () => {
  it("lowercase + trim + to_number", () => {
    const out = applyMappingAndTransforms(
      { email: "  AVA@Example.COM ", mrr: "$420" },
      [{ source: "email", target: "email" }, { source: "mrr", target: "mrr" }],
      [{ field: "email", op: "trim" }, { field: "email", op: "lowercase" }, { field: "mrr", op: "to_number" }]
    );
    expect(out.email).toBe("ava@example.com");
    expect(out.mrr).toBe(420);
  });
});

describe("validation", () => {
  it("rejects bad email and enforces unique", () => {
    const seen = new Map();
    expect(validateRecord({ email: "bad" }, [{ field: "email", rule: "email" }], seen)).toMatch(/email/);
    expect(validateRecord({ email: "a@b.co" }, [{ field: "email", rule: "unique" }], seen)).toBeNull();
    expect(validateRecord({ email: "a@b.co" }, [{ field: "email", rule: "unique" }], seen)).toMatch(/unique/);
  });
});

describe("processRows", () => {
  it("dedupes via known hashes and counts outcomes", () => {
    const rows = [{ email: "a@b.co" }, { email: "bad" }, { email: "a@b.co" }];
    const known = new Set<string>();
    const r1 = processRows(rows, {
      mappings: [{ source: "email", target: "email" }],
      transforms: [],
      validations: [{ field: "email", rule: "email" }, { field: "email", rule: "unique" }],
      knownHashes: known,
    });
    expect(r1.success).toBe(1);
    expect(r1.failed).toBe(1);
    expect(r1.skipped).toBe(1); // identical row deduped within the same batch
    const r2 = processRows(rows, {
      mappings: [{ source: "email", target: "email" }],
      transforms: [],
      validations: [],
      knownHashes: known,
    });
    expect(r2.skipped).toBe(2); // two hashes known from run 1 (1 ok + ...); "bad" row now succeeds
    expect(r2.success).toBe(1);
  });
  it("sha1 stable", () => {
    expect(sha1("x")).toBe(sha1("x"));
  });
});

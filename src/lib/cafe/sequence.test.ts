import { beforeEach, describe, expect, it, vi } from "vitest";

// A small in-memory stand-in for Twilio Sync documents.
const docs = new Map<string, { data: any; revision: number }>();
const fake = {
  documents: () => {
    const f: any = (name: string) => ({
      fetch: async () => {
        const d = docs.get(name);
        if (!d) throw { status: 404 };
        return { data: d.data, revision: String(d.revision) };
      },
      update: async ({ data, ifMatch }: any) => {
        const d = docs.get(name)!;
        if (ifMatch !== undefined && String(d.revision) !== String(ifMatch)) throw { status: 412 };
        docs.set(name, { data, revision: d.revision + 1 });
      },
    });
    f.create = async ({ uniqueName, data }: any) => {
      if (docs.has(uniqueName)) throw { status: 409 };
      docs.set(uniqueName, { data, revision: 1 });
    };
    return f;
  },
};
vi.mock("@/lib/twilio", () => ({ getSyncService: async () => fake }));

import { nextInSequence } from "./sequence";

describe("nextInSequence", () => {
  beforeEach(() => docs.clear());

  it("counts 1, 2, 3 with nothing skipped", async () => {
    expect([await nextInSequence("a"), await nextInSequence("a"), await nextInSequence("a")]).toEqual([1, 2, 3]);
  });
  it("two orders at once get different numbers", async () => {
    const got = await Promise.all([nextInSequence("b"), nextInSequence("b"), nextInSequence("b"), nextInSequence("b")]);
    expect(new Set(got).size).toBe(4);
    expect(Math.max(...got)).toBe(4);
  });
  it("continues after existing orders when it is first created", async () => {
    expect(await nextInSequence("c", async () => 40)).toBe(41);
    expect(await nextInSequence("c", async () => 999)).toBe(42); // the start value is used once
  });
  it("still starts when the starting value cannot be read", async () => {
    expect(await nextInSequence("d", async () => { throw new Error("x"); })).toBe(1);
  });
});

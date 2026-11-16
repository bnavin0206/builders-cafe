import { describe, expect, it, vi } from "vitest";
import { makeRecordSaver, type SaverOps } from "./record-saver";

const ops = (over: Partial<SaverOps> = {}) => {
  const calls: string[] = [];
  let rev = 10;
  const o: SaverOps = {
    writeIfUnchanged: vi.fn(async (_p, data, ifMatch) => {
      calls.push(`write(if ${ifMatch})`);
      rev++;
      return { data, revision: String(rev) };
    }),
    readMergeWrite: vi.fn(async (_p, patch) => {
      calls.push("read+merge+write");
      rev++;
      return { data: { ...patch }, revision: String(rev) };
    }),
    ...over,
  };
  return { o, calls };
};

describe("record saver", () => {
  it("with the revision in hand, each save is one call and uses the newest revision", async () => {
    const { o, calls } = ops();
    const save = makeRecordSaver(o, { data: { stage: "QUIZ", name: "A" }, revision: "10" });
    await save("+91", { stage: "SURVEY" });
    await save("+91", { surveyIndex: 1 });
    expect(calls).toEqual(["write(if 10)", "write(if 11)"]);
    expect((o.writeIfUnchanged as any).mock.calls[0][1]).toEqual({ stage: "SURVEY", name: "A" });
    expect((o.writeIfUnchanged as any).mock.calls[1][1]).toEqual({ stage: "SURVEY", name: "A", surveyIndex: 1 });
    expect(o.readMergeWrite).not.toHaveBeenCalled();
  });

  it("without a revision it uses the careful way first, then single calls", async () => {
    const { o, calls } = ops();
    const save = makeRecordSaver(o);
    await save("+91", { a: 1 });
    await save("+91", { b: 2 });
    expect(calls).toEqual(["read+merge+write", "write(if 11)"]);
  });

  it("if the record changed meanwhile (412), it reads, merges and writes instead, and nothing is lost", async () => {
    const { o, calls } = ops({
      writeIfUnchanged: vi.fn(async () => {
        throw Object.assign(new Error("precondition failed"), { status: 412 });
      }),
    });
    const save = makeRecordSaver(o, { data: { old: true }, revision: "5" });
    await save("+91", { stage: "X" });
    expect(calls).toEqual(["read+merge+write"]);
    expect((o.readMergeWrite as any).mock.calls[0][1]).toEqual({ stage: "X" });
  });

  it("a real failure of the careful way is passed on, not hidden", async () => {
    const { o } = ops({
      writeIfUnchanged: vi.fn(async () => {
        throw new Error("412");
      }),
      readMergeWrite: vi.fn(async () => {
        throw new Error("sync down");
      }),
    });
    const save = makeRecordSaver(o, { data: {}, revision: "1" });
    await expect(save("+91", { a: 1 })).rejects.toThrow("sync down");
  });
});

import { describe, expect, it } from "vitest";
import { makeOrderedQueue } from "./ordered-send";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ordered queue", () => {
  it("runs jobs in the order they were queued, even if a later one is faster", async () => {
    const q = makeOrderedQueue();
    const done: string[] = [];
    q(async () => { await sleep(40); done.push("thanks for playing"); });
    q(async () => { await sleep(1); done.push("question 1"); });
    await q(async () => { done.push("question 2"); });
    expect(done).toEqual(["thanks for playing", "question 1", "question 2"]);
  });
  it("a failing job does not stop the next ones", async () => {
    const errors: unknown[] = [];
    const q = makeOrderedQueue((e) => errors.push(e));
    const done: string[] = [];
    q(async () => { throw new Error("boom"); });
    await q(async () => { done.push("next"); });
    expect(done).toEqual(["next"]);
    expect(errors).toHaveLength(1);
  });
});

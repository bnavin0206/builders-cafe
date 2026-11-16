/**
 * Runs jobs one after another, in the order they were queued, even when a later
 * one would finish faster. Used so that two WhatsApp messages sent back to back
 * are created in that order (sent at the same moment, they can arrive swapped).
 * A failing job is logged and does not stop the ones behind it.
 */
export function makeOrderedQueue(onError: (e: unknown) => void = (e) => console.error("Queued message failed", e)) {
  let tail: Promise<unknown> = Promise.resolve();
  return (job: () => Promise<unknown>): Promise<unknown> => {
    const run = tail.then(job).catch(onError);
    tail = run;
    return run;
  };
}

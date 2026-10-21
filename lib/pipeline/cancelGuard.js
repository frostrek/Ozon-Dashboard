const cancelling = globalThis.__pipelineCancelling || new Set();
globalThis.__pipelineCancelling = cancelling;

export function markCancelling(runId) {
  cancelling.add(runId);
}

export function isCancelling(runId) {
  return cancelling.has(runId);
}

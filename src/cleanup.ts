import { resetResponderState } from './events/responder';
import { clearRenderResult } from './screen';

type CleanUpFunction = () => Promise<void> | void;

const cleanupQueue = new Set<CleanUpFunction>();

export async function cleanup() {
  clearRenderResult();
  resetResponderState();

  for (const fn of cleanupQueue) {
    await fn();
  }

  cleanupQueue.clear();
}

export function addToCleanupQueue(fn: CleanUpFunction) {
  cleanupQueue.add(fn);
}

export function removeFromCleanupQueue(fn: CleanUpFunction) {
  cleanupQueue.delete(fn);
}

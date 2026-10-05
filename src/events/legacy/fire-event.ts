import type { TestInstance } from 'test-renderer';

import { act } from '../../act';
import { findEventHandler } from './propagation';

/**
 * Finds a single handler for the event (see `findEventHandler`) and calls it with the passed
 * arguments, returning the handler's return value.
 */
export async function fireLegacyEvent(
  instance: TestInstance,
  eventName: string,
  ...data: unknown[]
): Promise<unknown> {
  const handler = findEventHandler(instance, eventName);
  if (!handler) {
    return undefined;
  }

  let returnValue;
  await act(() => {
    returnValue = handler(...data);
  });

  return returnValue;
}

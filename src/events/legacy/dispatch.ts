import type { TestInstance } from 'test-renderer';

import { act } from '../../act';
import { getEventHandlerFromProps } from '../handler';

/**
 * Calls the target's own handler for the event, without propagation.
 *
 * @param instance instance to trigger event on
 * @param eventName name of the event
 * @param event event payload(s)
 */
export async function dispatchLegacyEvent(
  instance: TestInstance,
  eventName: string,
  ...event: unknown[]
) {
  const handler = getEventHandlerFromProps(instance.props, eventName);
  if (!handler) {
    return;
  }

  await act(() => {
    handler(...event);
  });
}

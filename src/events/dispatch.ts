import type { TestInstance } from 'test-renderer';

import { isInstanceMounted } from '../helpers/component-tree';
import { dispatchNativeEvent } from './dispatch-native-event';
import { getNativeEventPayload } from './event-subsystem';
import { dispatchLegacyEvent } from './legacy/dispatch';

/**
 * Basic dispatch event function used by User Event module.
 *
 * Native events go through `dispatchNativeEvent()` (capture and bubble phases) when
 * `unstable_nativeEventDispatch` is enabled. Otherwise only the target's own handler is called.
 *
 * @param instance instance to trigger event on
 * @param eventName name of the event
 * @param event event payload(s)
 */
export async function dispatchEvent(
  instance: TestInstance,
  eventName: string,
  ...event: unknown[]
) {
  if (!isInstanceMounted(instance)) {
    return;
  }

  const nativeEvent = getNativeEventPayload(eventName, event[0]);
  if (nativeEvent != null) {
    await dispatchNativeEvent(instance, eventName, nativeEvent);
    return;
  }

  await dispatchLegacyEvent(instance, eventName, ...event);
}

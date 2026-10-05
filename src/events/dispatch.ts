import type { TestInstance } from 'test-renderer';

import { act } from '../act';
import { getConfig } from '../config';
import { isInstanceMounted } from '../helpers/component-tree';
import { dispatchNativeEvent } from './dispatch-native-event';
import { getEventTypeConfig } from './event-types';
import { getEventHandlerFromProps } from './handler';
import type { NativeEventPayload } from './synthetic-event';

/**
 * Events that `userEvent` sends to component callbacks passed to host elements by Jest mocks
 * (e.g. `onPress` on mocked `Text`), rather than native events. They are always called directly,
 * even when React Native has a native event with the same name.
 */
const componentCallbackEvents = new Set(['press']);

/**
 * Basic dispatch event function used by User Event module.
 *
 * With `unstable_nativeEventDispatch` enabled, native events are dispatched through
 * `dispatchNativeEvent()` (capture and bubble phases). Other events only call the target handler.
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

  if (getConfig().unstable_nativeEventDispatch) {
    const nativeEvent = getNativeEventPayload(event[0]);
    if (
      nativeEvent != null &&
      !componentCallbackEvents.has(eventName) &&
      getEventTypeConfig(eventName) != null
    ) {
      await dispatchNativeEvent(instance, eventName, nativeEvent);
      return;
    }
  }

  const handler = getEventHandlerFromProps(instance.props, eventName);
  if (!handler) {
    return;
  }

  await act(() => {
    handler(...event);
  });
}

function getNativeEventPayload(event: unknown): NativeEventPayload | null {
  if (event == null || typeof event !== 'object' || !('nativeEvent' in event)) {
    return null;
  }

  const nativeEvent = event.nativeEvent;
  return nativeEvent != null && typeof nativeEvent === 'object'
    ? (nativeEvent as NativeEventPayload)
    : null;
}

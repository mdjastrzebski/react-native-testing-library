import { getConfig } from '../config';
import { getEventTypeConfig } from './event-types';
import type { NativeEventPayload } from './synthetic-event';

/**
 * Events sent to component callbacks passed to host elements by Jest mocks (e.g. `onPress` on
 * mocked `Text`), rather than native events. They always use the legacy subsystem, even when
 * React Native has a native event with the same name.
 */
const componentCallbackEvents = new Set(['press']);

/**
 * Decides which event subsystem handles the event.
 *
 * Returns the native event payload when the event should go through `dispatchNativeEvent`:
 * `unstable_nativeEventDispatch` is enabled, React Native knows the event, and the event
 * argument is missing or has a `nativeEvent` object. Returns `null` for the legacy subsystem.
 */
export function getNativeEventPayload(
  eventName: string,
  eventArg: unknown,
): NativeEventPayload | null {
  if (!getConfig().unstable_nativeEventDispatch) {
    return null;
  }

  if (componentCallbackEvents.has(eventName) || getEventTypeConfig(eventName) == null) {
    return null;
  }

  if (eventArg === undefined) {
    return {};
  }

  if (eventArg == null || typeof eventArg !== 'object' || !('nativeEvent' in eventArg)) {
    return null;
  }

  const nativeEvent = eventArg.nativeEvent;
  return nativeEvent != null && typeof nativeEvent === 'object'
    ? (nativeEvent as NativeEventPayload)
    : null;
}

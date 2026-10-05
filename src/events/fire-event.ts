import type { TestInstance } from 'test-renderer';

import { isInstanceMounted } from '../helpers/component-tree';
import { formatElement } from '../helpers/format-element';
import { isHostScrollView } from '../helpers/host-component-names';
import { logger } from '../helpers/logger';
import { buildLayoutEvent, buildTouchEvent } from './builders/common';
import { mergeEventProps } from './builders/merge';
import { buildScrollEvent } from './builders/scroll';
import { dispatchNativeEvent } from './dispatch-native-event';
import { getNativeEventPayload } from './event-subsystem';
import { getEventTypeConfig } from './event-types';
import { getEventHandlerFromProps, normalizeEventName } from './handler';
import { isNativeEventEnabled } from './is-enabled';
import { fireLegacyEvent } from './legacy/fire-event';
import { nativeState } from './native-state';
import type { EventName, EventProps, LayoutRectangle } from './types';
import { updateNativeStateFromEvent } from './update-native-state';

/**
 * Fires an event on the element.
 *
 * - Legacy subsystem (default): calls the first enabled handler found on the element or its
 *   ancestors (including composite components) with the passed arguments, and returns its result.
 * - Native subsystem (`unstable_nativeEventDispatch`, events known to React Native): dispatches
 *   `data[0].nativeEvent` through `dispatchNativeEvent()`, calling every handler on the host path
 *   in capture and bubble phases. Returns `undefined`.
 */
async function fireEvent(instance: TestInstance, eventName: EventName, ...data: unknown[]) {
  if (!isInstanceMounted(instance)) {
    return;
  }

  // `fireEvent` accepts event names with and without the `on*` prefix.
  const normalizedEventName = normalizeEventName(eventName);
  updateNativeStateFromEvent(instance, normalizedEventName, data[0]);

  const nativeEvent = getNativeEventPayload(normalizedEventName, data[0]);
  if (nativeEvent != null) {
    warnOnMissingDirectEventHandler(instance, normalizedEventName);
    if (isNativeEventEnabled(instance, normalizedEventName)) {
      await dispatchNativeEvent(instance, normalizedEventName, nativeEvent);
    }
    return;
  }

  return await fireLegacyEvent(instance, eventName, ...data);
}

/**
 * Direct events only reach the target, so a missing handler there is likely a test mistake.
 */
function warnOnMissingDirectEventHandler(instance: TestInstance, eventName: string) {
  const config = getEventTypeConfig(eventName);
  if (config?.kind === 'direct' && !getEventHandlerFromProps(instance.props, eventName)) {
    logger.warn(
      `fireEvent: element has no handler for "${eventName}" event.`,
      formatElement(instance),
    );
  }
}

fireEvent.changeText = async (instance: TestInstance, text: string) =>
  await fireEvent(instance, 'changeText', text);

fireEvent.press = async (instance: TestInstance, eventProps?: EventProps) => {
  await fireEvent(instance, 'press', mergeEventProps(buildTouchEvent(), eventProps));
};

fireEvent.scroll = async (instance: TestInstance, eventProps?: EventProps) => {
  const layoutMeasurement = isHostScrollView(instance)
    ? nativeState.layoutSizeForInstance.get(instance)
    : undefined;
  const event = buildScrollEvent(undefined, { layoutMeasurement });
  await fireEvent(instance, 'scroll', mergeEventProps(event, eventProps));
};

fireEvent.layout = async (instance: TestInstance, layout?: Partial<LayoutRectangle>) => {
  await fireEvent(instance, 'layout', buildLayoutEvent(layout));
};

export { fireEvent };

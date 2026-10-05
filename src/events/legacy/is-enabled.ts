import type { TestInstance } from 'test-renderer';

import { isHostTextInput } from '../../helpers/host-component-names';
import { isEditableTextInput } from '../../helpers/text-input';
import { isPointerEventEnabled, textInputEventsIgnoringEditableProp } from '../is-enabled';

export function isTouchResponder(instance: TestInstance) {
  return Boolean(instance.props.onStartShouldSetResponder) || isHostTextInput(instance);
}

/**
 * List of events affected by `pointerEvents` prop.
 */
const eventsAffectedByPointerEventsProp = new Set(['press']);

/**
 * Checks whether a device would deliver the event to the instance, taking into account
 * `pointerEvents`, non-editable `TextInput` and touch responders that decline the touch.
 * Expects event name without the `on*` prefix (see `normalizeEventName`).
 */
export function isEventEnabled(
  instance: TestInstance,
  eventName: string,
  nearestTouchResponder?: TestInstance,
) {
  if (nearestTouchResponder != null && isHostTextInput(nearestTouchResponder)) {
    return (
      isEditableTextInput(nearestTouchResponder) ||
      textInputEventsIgnoringEditableProp.has(eventName)
    );
  }

  if (eventsAffectedByPointerEventsProp.has(eventName) && !isPointerEventEnabled(instance)) {
    return false;
  }

  const touchStart = nearestTouchResponder?.props.onStartShouldSetResponder?.();
  const touchMove = nearestTouchResponder?.props.onMoveShouldSetResponder?.();
  if (touchStart || touchMove) {
    return true;
  }

  return touchStart === undefined && touchMove === undefined;
}

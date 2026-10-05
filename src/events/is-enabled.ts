import { StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { isHostTextInput } from '../helpers/host-component-names';
import { isEditableTextInput } from '../helpers/text-input';

/**
 * pointerEvents controls whether the View can be the target of touch events.
 * 'auto': The View and its children can be the target of touch events.
 * 'none': The View is never the target of touch events.
 * 'box-none': The View is never the target of touch events but its subviews can be
 * 'box-only': The view can be the target of touch events but its subviews cannot be
 * see the official react native doc https://reactnative.dev/docs/view#pointerevents */
export const isPointerEventEnabled = (instance: TestInstance, isParent?: boolean): boolean => {
  // Check both props.pointerEvents and props.style.pointerEvents
  const pointerEvents =
    instance?.props.pointerEvents ?? StyleSheet.flatten(instance?.props.style)?.pointerEvents;

  const parentCondition = isParent ? pointerEvents === 'box-only' : pointerEvents === 'box-none';

  if (pointerEvents === 'none' || parentCondition) {
    return false;
  }

  if (!instance.parent) {
    return true;
  }

  return isPointerEventEnabled(instance.parent, true);
};

/**
 * List of `TextInput` events not affected by `editable` prop.
 */
export const textInputEventsIgnoringEditableProp = new Set([
  'contentSizeChange',
  'layout',
  'scroll',
]);

/**
 * Checks whether a device would emit a native event from the target element: a non-editable
 * `TextInput` (or its nested `Text`) emits no editing events. Touch delivery is decided by
 * the responder system, so `pointerEvents` and touch responders are not checked here.
 * Expects event name without the `on*` prefix.
 */
export function isNativeEventEnabled(instance: TestInstance, eventName: string) {
  const textInput = findHostTextInput(instance);
  if (textInput != null) {
    return isEditableTextInput(textInput) || textInputEventsIgnoringEditableProp.has(eventName);
  }

  return true;
}

function findHostTextInput(instance: TestInstance): TestInstance | null {
  let current: TestInstance | null = instance;
  while (current != null) {
    if (isHostTextInput(current)) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

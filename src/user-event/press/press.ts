import type { TestInstance } from 'test-renderer';

import { act } from '../../act';
import { getConfig } from '../../config';
import {
  buildResponderGrantEvent,
  buildResponderReleaseEvent,
  buildTouchEvent,
  buildTouchNativeEvent,
  dispatchEvent,
  dispatchNativeEvent,
  getEventHandlerFromProps,
  isPointerEventEnabled,
} from '../../events';
import { isTestInstance } from '../../helpers/component-tree';
import { ErrorWithStack } from '../../helpers/errors';
import { isHostText, isHostTextInput } from '../../helpers/host-component-names';
import type { UserEventConfig, UserEventInstance } from '../setup';
import { wait } from '../utils';

// These are constants defined in the React Native repo
// See: https://github.com/facebook/react-native/blob/50e38cc9f1e6713228a91ad50f426c4f65e65e1a/packages/react-native/Libraries/Pressability/Pressability.js#L264
export const DEFAULT_MIN_PRESS_DURATION = 130;
export const DEFAULT_LONG_PRESS_DELAY_MS = 500;

export interface PressOptions {
  duration?: number;
}

export async function press(this: UserEventInstance, instance: TestInstance): Promise<void> {
  if (!isTestInstance(instance)) {
    throw new ErrorWithStack(`press() works only with host instances.`, press);
  }

  await basePress(this.config, instance, {
    type: 'press',
  });
}

export async function longPress(
  this: UserEventInstance,
  instance: TestInstance,
  options?: PressOptions,
): Promise<void> {
  if (!isTestInstance(instance)) {
    throw new ErrorWithStack(`longPress() works only with host instances.`, longPress);
  }

  await basePress(this.config, instance, {
    type: 'longPress',
    duration: options?.duration ?? DEFAULT_LONG_PRESS_DELAY_MS,
  });
}

interface BasePressOptions {
  type: 'press' | 'longPress';
  duration?: number;
}

const basePress = async (
  config: UserEventConfig,
  instance: TestInstance,
  options: BasePressOptions,
  target: TestInstance = instance,
): Promise<void> => {
  if (isEnabledHostElement(instance) && hasPressEventHandler(instance)) {
    await emitDirectPressEvents(config, instance, options);
    return;
  }

  if (getConfig().unstable_nativeEventDispatch) {
    // The responder system picks the element that handles the touch, so touch events
    // are sent to the pressed element, not to the touch responder found here.
    if (isTouchResponderCandidate(instance) || !instance.parent) {
      await emitTouchPressEvents(config, target, options);
      return;
    }
  } else if (isEnabledTouchResponder(instance)) {
    await emitPressabilityPressEvents(config, instance, options);
    return;
  }

  if (!instance.parent) {
    return;
  }

  await basePress(config, instance.parent, options, target);
};

function isEnabledHostElement(instance: TestInstance) {
  if (!isPointerEventEnabled(instance)) {
    return false;
  }

  if (isHostText(instance)) {
    return instance.props.disabled !== true;
  }

  if (isHostTextInput(instance)) {
    return instance.props.editable !== false;
  }

  return true;
}

function isEnabledTouchResponder(instance: TestInstance) {
  return isPointerEventEnabled(instance) && instance.props.onStartShouldSetResponder?.();
}

function isTouchResponderCandidate(instance: TestInstance) {
  return (
    instance.props.onStartShouldSetResponder != null ||
    instance.props.onStartShouldSetResponderCapture != null
  );
}

function hasPressEventHandler(instance: TestInstance) {
  return (
    getEventHandlerFromProps(instance.props, 'press') ||
    getEventHandlerFromProps(instance.props, 'longPress') ||
    getEventHandlerFromProps(instance.props, 'pressIn') ||
    getEventHandlerFromProps(instance.props, 'pressOut')
  );
}

/**
 * Dispatches a press event sequence for host instances that have `onPress*` event handlers.
 */
async function emitDirectPressEvents(
  config: UserEventConfig,
  instance: TestInstance,
  options: BasePressOptions,
) {
  await wait(config);
  await dispatchEvent(instance, 'pressIn', buildTouchEvent());

  await wait(config, options.duration);

  // Long press events are emitted before `pressOut`.
  if (options.type === 'longPress') {
    await dispatchEvent(instance, 'longPress', buildTouchEvent());
  }

  await dispatchEvent(instance, 'pressOut', buildTouchEvent());

  // Regular press events are emitted after `pressOut` according to the React Native docs.
  // See: https://reactnative.dev/docs/pressable#onpress
  // Experimentally for very short presses (< 130ms) `press` events are actually emitted before `onPressOut`, but
  // we will ignore that as in reality most pressed would be above the 130ms threshold.
  if (options.type === 'press') {
    await dispatchEvent(instance, 'press', buildTouchEvent());
  }
}

async function emitPressabilityPressEvents(
  config: UserEventConfig,
  instance: TestInstance,
  options: BasePressOptions,
) {
  await wait(config);

  await dispatchEvent(instance, 'responderGrant', buildResponderGrantEvent());

  const duration = options.duration ?? DEFAULT_MIN_PRESS_DURATION;
  await wait(config, duration);

  await dispatchEvent(instance, 'responderRelease', buildResponderReleaseEvent());

  // React Native will wait for minimal delay of DEFAULT_MIN_PRESS_DURATION
  // before emitting the `pressOut` event. We need to wait here, so that
  // `press()` function does not return before that.
  if (DEFAULT_MIN_PRESS_DURATION - duration > 0) {
    await act(() => wait(config, DEFAULT_MIN_PRESS_DURATION - duration));
  }
}

/**
 * Dispatches touch events, like a device does. Pressability receives `onResponderGrant` and
 * `onResponderRelease` from the responder system (`dispatchNativeEvent`).
 */
async function emitTouchPressEvents(
  config: UserEventConfig,
  target: TestInstance,
  options: BasePressOptions,
) {
  // Device does not deliver touches to elements with disabled pointer events.
  if (!isPointerEventEnabled(target)) {
    return;
  }

  await wait(config);
  await dispatchNativeEvent(target, 'touchStart', buildTouchNativeEvent('touchStart'));

  const duration = options.duration ?? DEFAULT_MIN_PRESS_DURATION;
  await wait(config, duration);

  await dispatchNativeEvent(target, 'touchEnd', buildTouchNativeEvent('touchEnd'));

  // See `emitPressabilityPressEvents`.
  if (DEFAULT_MIN_PRESS_DURATION - duration > 0) {
    await act(() => wait(config, DEFAULT_MIN_PRESS_DURATION - duration));
  }
}

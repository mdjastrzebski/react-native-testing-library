import type { TestInstance } from 'test-renderer';

import { act } from '../act';
import { isInstanceMounted } from '../helpers/component-tree';
import { getEventTypeConfig, toEventType } from './event-types';
import { ensureHostMethods, getHostPath, getPropHandler } from './host-path';
import { processResponderEvent, rethrowCaughtResponderError } from './responder';
import type { NativeEventPayload } from './synthetic-event';
import { SyntheticEvent } from './synthetic-event';

/**
 * Dispatches an event the way React Native dispatches events coming from native
 * (`src/private/renderer/events/dispatchNativeEvent.js` and `EventTarget.dispatch()`):
 *
 * 1. Responder negotiation and lifecycle (touch, scroll and selection change events).
 * 2. Capture phase from the root to the target, calling `on*Capture` props.
 * 3. Bubble phase from the target to the root, calling `on*` props. Non-bubbling events
 *    only call the target, and direct events skip the capture phase.
 *
 * Only host elements are on the event path, props of composite components are never called.
 * Events unknown to React Native are not dispatched.
 *
 * @param target host element that receives the event
 * @param eventType event type, e.g. `pointerUp`, `onPointerUp` or `topPointerUp`
 * @param nativeEvent native event payload, available as `event.nativeEvent`
 * @returns `false` if a handler called `preventDefault()`, `true` otherwise
 */
export async function dispatchNativeEvent(
  target: TestInstance,
  eventType: string,
  nativeEvent: NativeEventPayload = {},
): Promise<boolean> {
  if (!isInstanceMounted(target)) {
    return true;
  }

  let result = true;
  // React Native batches updates for the whole dispatch.
  await act(() => {
    result = dispatchNativeEventSync(target, eventType, nativeEvent);
  });

  return result;
}

function dispatchNativeEventSync(
  target: TestInstance,
  eventType: string,
  nativeEvent: NativeEventPayload,
): boolean {
  const type = toEventType(eventType);
  processResponderEvent(type, target, nativeEvent);

  try {
    const config = getEventTypeConfig(type);
    if (config == null) {
      return true;
    }

    if (config.kind === 'direct') {
      const event = new SyntheticEvent(
        type,
        { cancelable: true, dispatchConfig: { registrationName: config.registrationName } },
        nativeEvent,
      );
      // Direct events are dispatched only to the target, without capture phase.
      dispatch(target, event, [target], config.registrationName, null);
      return !event.defaultPrevented;
    }

    const event = new SyntheticEvent(
      type,
      {
        // `skipBubbling` events have a capture phase, but bubble phase only calls the target.
        bubbles: !config.skipBubbling,
        cancelable: true,
        dispatchConfig: {
          phasedRegistrationNames: {
            bubbled: config.bubbled,
            captured: config.captured,
            skipBubbling: config.skipBubbling,
          },
        },
      },
      nativeEvent,
    );
    dispatch(target, event, getHostPath(target), config.bubbled, config.captured);
    return !event.defaultPrevented;
  } finally {
    rethrowCaughtResponderError();
  }
}

type ErrorState = { hasError: boolean; error: unknown };

function dispatch(
  target: TestInstance,
  event: SyntheticEvent,
  path: TestInstance[],
  bubbledPropName: string,
  capturedPropName: string | null,
) {
  const errorState: ErrorState = { hasError: false, error: undefined };
  event.target = target;

  // Capture phase: root → target
  if (capturedPropName != null) {
    for (let i = path.length - 1; i >= 0; i -= 1) {
      if (event.isPropagationStopped()) {
        break;
      }

      const node = path[i];
      event.eventPhase =
        node === target ? SyntheticEvent.AT_TARGET : SyntheticEvent.CAPTURING_PHASE;
      invoke(node, event, capturedPropName, errorState);
    }
  }

  // Bubble phase: target → root
  for (const node of path) {
    if (event.isPropagationStopped()) {
      break;
    }

    if (!event.bubbles && node !== target) {
      break;
    }

    event.eventPhase = node === target ? SyntheticEvent.AT_TARGET : SyntheticEvent.BUBBLING_PHASE;
    invoke(node, event, bubbledPropName, errorState);
  }

  event.eventPhase = SyntheticEvent.NONE;
  event.currentTarget = null;
  event.resetPropagationFlags();

  // React Native rethrows the first handler error after the whole dispatch.
  if (errorState.hasError) {
    throw errorState.error;
  }
}

function invoke(
  node: TestInstance,
  event: SyntheticEvent,
  propName: string,
  errorState: ErrorState,
) {
  const handler = getPropHandler(node, propName);
  if (handler == null) {
    return;
  }

  ensureHostMethods(node);
  event.currentTarget = node;
  try {
    handler(event);
  } catch (error) {
    if (!errorState.hasError) {
      errorState.hasError = true;
      errorState.error = error;
    }
  }
}

import type { TestInstance } from 'test-renderer';

import { isInstanceMounted } from '../helpers/component-tree';
import { ensureHostMethods, getHostParent, getHostPath, getPropHandler } from './host-path';
import type { NativeEventPayload, TouchHistory } from './synthetic-event';
import { ResponderSyntheticEvent } from './synthetic-event';

/**
 * Port of React Native's responder system (`src/private/renderer/events/ReactNativeResponder.js`),
 * which runs before regular event dispatch for touch, scroll and selection change events.
 *
 * Simplifications (POC):
 * - `touchHistory` only tracks the number of active touches.
 * - No `setIsJSResponder` call, as there is no native side.
 */

type ResponderState = {
  responder: TestInstance | null;
  trackedTouchCount: number;
  touchHistory: TouchHistory;
  hasError: boolean;
  caughtError: unknown;
};

const state: ResponderState = createInitialState();

function createInitialState(): ResponderState {
  return {
    responder: null,
    trackedTouchCount: 0,
    touchHistory: {
      numberActiveTouches: 0,
      indexOfSingleActiveTouch: -1,
      mostRecentTimeStamp: 0,
      touchBank: [],
    },
    hasError: false,
    caughtError: null,
  };
}

export function resetResponderState() {
  Object.assign(state, createInitialState());
}

export function getCurrentResponder() {
  return state.responder;
}

const isStartish = (type: string) => type === 'touchStart';
const isMoveish = (type: string) => type === 'touchMove';
const isEndish = (type: string) => type === 'touchEnd' || type === 'touchCancel';

function getShouldSetPropNames(type: string) {
  const name = isStartish(type)
    ? 'onStartShouldSetResponder'
    : isMoveish(type)
      ? 'onMoveShouldSetResponder'
      : type === 'selectionChange'
        ? 'onSelectionChangeShouldSetResponder'
        : 'onScrollShouldSetResponder';

  return {
    type: name.slice(2, 3).toLowerCase() + name.slice(3),
    bubbled: name,
    captured: `${name}Capture`,
  };
}

function isResponderRelevantType(type: string) {
  return (
    isStartish(type) ||
    isMoveish(type) ||
    isEndish(type) ||
    type === 'scroll' ||
    type === 'selectionChange'
  );
}

function canTriggerTransfer(type: string, nativeEvent: NativeEventPayload) {
  return (
    (type === 'scroll' && nativeEvent.responderIgnoreScroll !== true) ||
    (state.trackedTouchCount > 0 && type === 'selectionChange') ||
    isStartish(type) ||
    isMoveish(type)
  );
}

function getLowestCommonAncestor(a: TestInstance, b: TestInstance): TestInstance | null {
  const pathB = new Set(getHostPath(b));
  let current: TestInstance | null = a;
  while (current != null) {
    if (pathB.has(current)) {
      return current;
    }
    current = getHostParent(current);
  }

  return null;
}

function negotiateResponder(
  target: TestInstance,
  type: string,
  nativeEvent: NativeEventPayload,
): TestInstance | null {
  let dispatchNode: TestInstance | null;
  if (state.responder == null) {
    dispatchNode = target;
  } else {
    const ancestor = getLowestCommonAncestor(state.responder, target);
    if (ancestor == null) {
      return null;
    }

    // Responder can only be transferred to an ancestor of the current responder.
    dispatchNode = ancestor === state.responder ? getHostParent(ancestor) : ancestor;
  }

  if (dispatchNode == null) {
    return null;
  }

  const names = getShouldSetPropNames(type);
  const event = new ResponderSyntheticEvent(
    names.type,
    { bubbles: true, cancelable: true },
    nativeEvent,
    state.touchHistory,
  );
  event.target = target;

  // Target first, root last.
  const path = getHostPath(dispatchNode);

  // Capture phase: root → target
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (callShouldSetHandler(path[i], names.captured, event)) {
      return path[i];
    }
  }

  // Bubble phase: target → root
  for (const node of path) {
    if (callShouldSetHandler(node, names.bubbled, event)) {
      return node;
    }
  }

  event.currentTarget = null;
  return null;
}

function callShouldSetHandler(
  node: TestInstance,
  propName: string,
  event: ResponderSyntheticEvent,
): boolean {
  const handler = getPropHandler(node, propName);
  if (handler == null) {
    return false;
  }

  ensureHostMethods(node);
  event.currentTarget = node;
  const result = handler(event) === true;
  if (result) {
    event.currentTarget = null;
  }

  return result;
}

function dispatchResponderEvent(
  node: TestInstance,
  propName: string,
  nativeEvent: NativeEventPayload,
  target: TestInstance | null,
): unknown {
  const handler = getPropHandler(node, propName);
  if (handler == null) {
    return undefined;
  }

  const type = propName.slice(2, 3).toLowerCase() + propName.slice(3);
  const event = new ResponderSyntheticEvent(
    type,
    { bubbles: false, cancelable: true, dispatchConfig: { registrationName: propName } },
    nativeEvent,
    state.touchHistory,
  );

  ensureHostMethods(node);
  event.target = target;
  event.currentTarget = node;

  let result: unknown;
  try {
    result = handler(event);
  } catch (error) {
    if (!state.hasError) {
      state.hasError = true;
      state.caughtError = error;
    }
  }

  event.currentTarget = null;
  return result;
}

function noResponderTouches(nativeEvent: NativeEventPayload) {
  const touches = nativeEvent.touches;
  return !Array.isArray(touches) || touches.length === 0;
}

/**
 * Runs responder negotiation and lifecycle events for the given event.
 * Expects event type without the `on*` prefix (e.g. `touchStart`).
 */
export function processResponderEvent(
  type: string,
  target: TestInstance,
  nativeEvent: NativeEventPayload,
) {
  // Responder was unmounted while touch was in progress
  if (state.responder != null && !isInstanceMounted(state.responder)) {
    state.responder = null;
  }

  if (state.responder == null && !isResponderRelevantType(type)) {
    return;
  }

  if (isStartish(type)) {
    state.trackedTouchCount += 1;
  } else if (isEndish(type)) {
    if (state.trackedTouchCount <= 0) {
      return;
    }
    state.trackedTouchCount -= 1;
  }

  if (isStartish(type) || isMoveish(type) || isEndish(type)) {
    state.touchHistory.numberActiveTouches = state.trackedTouchCount;
    state.touchHistory.indexOfSingleActiveTouch = state.trackedTouchCount === 1 ? 0 : -1;
    const timestamp = nativeEvent.timestamp;
    if (typeof timestamp === 'number') {
      state.touchHistory.mostRecentTimeStamp = timestamp;
    }
  }

  if (canTriggerTransfer(type, nativeEvent)) {
    const wantsResponder = negotiateResponder(target, type, nativeEvent);
    if (wantsResponder != null && wantsResponder !== state.responder) {
      dispatchResponderEvent(wantsResponder, 'onResponderGrant', nativeEvent, target);

      const current = state.responder;
      if (current == null) {
        state.responder = wantsResponder;
      } else {
        const shouldSwitch =
          dispatchResponderEvent(current, 'onResponderTerminationRequest', nativeEvent, target) !==
          false;
        if (shouldSwitch) {
          dispatchResponderEvent(current, 'onResponderTerminate', nativeEvent, target);
          state.responder = wantsResponder;
        } else {
          dispatchResponderEvent(wantsResponder, 'onResponderReject', nativeEvent, target);
        }
      }
    }
  }

  const responder = state.responder;
  if (responder == null) {
    return;
  }

  if (isStartish(type)) {
    dispatchResponderEvent(responder, 'onResponderStart', nativeEvent, target);
  } else if (isMoveish(type)) {
    dispatchResponderEvent(responder, 'onResponderMove', nativeEvent, target);
  } else if (isEndish(type)) {
    dispatchResponderEvent(responder, 'onResponderEnd', nativeEvent, target);

    if (type === 'touchCancel') {
      dispatchResponderEvent(responder, 'onResponderTerminate', nativeEvent, target);
      state.responder = null;
    } else if (noResponderTouches(nativeEvent)) {
      dispatchResponderEvent(responder, 'onResponderRelease', nativeEvent, target);
      state.responder = null;
    }
  }
}

/**
 * Rethrows the first error thrown by a responder handler, after the whole dispatch completed.
 */
export function rethrowCaughtResponderError() {
  if (state.hasError) {
    const error = state.caughtError;
    state.hasError = false;
    state.caughtError = null;
    throw error;
  }
}

import type { TestInstance } from 'test-renderer';

export type NativeEventPayload = Record<string, unknown>;

export type SyntheticEventInit = {
  bubbles?: boolean;
  cancelable?: boolean;
  dispatchConfig?: unknown;
};

/**
 * Event object passed to handlers by `dispatchNativeEvent`.
 *
 * Mirrors React Native's `LegacySyntheticEvent` (a W3C `Event` with the legacy
 * `SyntheticEvent` methods), so handlers can read `nativeEvent`, `target`, `currentTarget`,
 * `eventPhase` and stop propagation the same way they do on a device.
 *
 * `target` and `currentTarget` are host instances, the same objects a `ref` receives in tests.
 */
export class SyntheticEvent {
  static readonly NONE = 0;
  static readonly CAPTURING_PHASE = 1;
  static readonly AT_TARGET = 2;
  static readonly BUBBLING_PHASE = 3;

  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly isTrusted = true;
  readonly nativeEvent: NativeEventPayload;
  readonly dispatchConfig: unknown;
  readonly timeStamp: number;

  target: TestInstance | null = null;
  currentTarget: TestInstance | null = null;
  eventPhase: number = SyntheticEvent.NONE;
  defaultPrevented = false;

  #propagationStopped = false;

  constructor(type: string, init: SyntheticEventInit, nativeEvent: NativeEventPayload = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.dispatchConfig = init.dispatchConfig ?? null;
    this.nativeEvent = nativeEvent;

    // React Native preserves the native timestamp
    const nativeTimestamp = nativeEvent.timeStamp ?? nativeEvent.timestamp;
    this.timeStamp = typeof nativeTimestamp === 'number' ? nativeTimestamp : Date.now();
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  isDefaultPrevented() {
    return this.defaultPrevented;
  }

  stopPropagation() {
    this.#propagationStopped = true;
  }

  /** Same as `stopPropagation()`: each element has a single prop handler per phase. */
  stopImmediatePropagation() {
    this.#propagationStopped = true;
  }

  isPropagationStopped() {
    return this.#propagationStopped;
  }

  /** @internal Resets propagation flags after dispatch, as the DOM dispatch algorithm does. */
  resetPropagationFlags() {
    this.#propagationStopped = false;
  }

  /** No-op: events are never pooled. */
  persist() {}

  isPersistent() {
    return true;
  }
}

/**
 * Event passed to responder handlers (`onResponderGrant`, `onStartShouldSetResponder`, ...).
 */
export class ResponderSyntheticEvent extends SyntheticEvent {
  readonly touchHistory: TouchHistory;

  constructor(
    type: string,
    init: SyntheticEventInit,
    nativeEvent: NativeEventPayload,
    touchHistory: TouchHistory,
  ) {
    super(type, init, nativeEvent);
    this.touchHistory = touchHistory;
  }
}

/**
 * Simplified version of React Native's `ResponderTouchHistoryStore.touchHistory`.
 * POC: only active touch count is tracked, `touchBank` is not.
 */
export type TouchHistory = {
  numberActiveTouches: number;
  indexOfSingleActiveTouch: number;
  mostRecentTimeStamp: number;
  touchBank: unknown[];
};

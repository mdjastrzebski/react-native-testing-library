/**
 * Event types known to React Native, mirroring its view config registry
 * (`customBubblingEventTypes` / `customDirectEventTypes`).
 *
 * React Native builds this registry at runtime from view configs, but `@react-native/jest-preset`
 * mocks native components so the registry stays empty in Jest. This table is a static copy of the
 * union of `BaseViewConfig.{ios,android}.js` and the built-in components' view configs.
 * `__tests__/event-types.test.ts` checks it against the installed `react-native` version.
 *
 * Prop names follow React Native's convention: `on${Type}` for bubbling and direct events, and
 * `on${Type}Capture` for the capture phase of bubbling events.
 */

/** Bubbling events. Value is `true` when the view config sets `skipBubbling`. */
const bubblingEventTypes: Record<string, boolean> = {
  blur: false,
  change: false,
  click: false,
  endEditing: false,
  focus: false,
  gotPointerCapture: false,
  keyDown: false,
  keyPress: false,
  keyUp: false,
  lostPointerCapture: false,
  pointerCancel: false,
  pointerDown: false,
  pointerEnter: true,
  pointerLeave: true,
  pointerMove: false,
  pointerOut: false,
  pointerOver: false,
  pointerUp: false,
  press: false,
  select: false,
  submitEditing: false,
  touchCancel: false,
  touchEnd: false,
  touchMove: false,
  touchStart: false,
};

const directEventTypes = new Set([
  'accessibilityAction',
  'accessibilityEscape',
  'accessibilityTap',
  'changeSync',
  'contentSizeChange',
  'dismiss',
  'drawerClose',
  'drawerOpen',
  'drawerSlide',
  'drawerStateChanged',
  'error',
  'keyPressSync',
  'layout',
  'load',
  'loadEnd',
  'loadStart',
  'loadingError',
  'loadingFinish',
  'loadingStart',
  'magicTap',
  'message',
  'momentumScrollBegin',
  'momentumScrollEnd',
  'orientationChange',
  'partialLoad',
  'progress',
  'refresh',
  'requestClose',
  'scroll',
  'scrollBeginDrag',
  'scrollEndDrag',
  'scrollToTop',
  'selectionChange',
  'show',
]);

export type EventTypeConfig =
  | {
      kind: 'bubbling';
      type: string;
      bubbled: string;
      captured: string;
      skipBubbling: boolean;
    }
  | {
      kind: 'direct';
      type: string;
      registrationName: string;
    };

/**
 * Returns the config for an event type, or `null` when React Native doesn't know the event.
 * Accepts `pointerUp`, `onPointerUp` and `topPointerUp` forms.
 */
export function getEventTypeConfig(eventType: string): EventTypeConfig | null {
  const type = toEventType(eventType);

  const skipBubbling = bubblingEventTypes[type];
  if (skipBubbling !== undefined) {
    const propName = toPropName(type);
    return {
      kind: 'bubbling',
      type,
      bubbled: propName,
      captured: `${propName}Capture`,
      skipBubbling,
    };
  }

  if (directEventTypes.has(type)) {
    return { kind: 'direct', type, registrationName: toPropName(type) };
  }

  return null;
}

/**
 * Converts `onPointerUp` or `topPointerUp` to `pointerUp`.
 */
export function toEventType(eventType: string) {
  const match = /^(on|top)([A-Z].*)$/.exec(eventType);
  if (match) {
    return match[2].charAt(0).toLowerCase() + match[2].slice(1);
  }

  return eventType;
}

function toPropName(type: string) {
  return `on${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

/** @internal Exposed for the RN sync test. */
export const eventTypesForTesting = { bubblingEventTypes, directEventTypes };

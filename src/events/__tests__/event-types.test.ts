import { eventTypesForTesting, getEventTypeConfig, toEventType } from '../event-types';

type ViewConfig = {
  bubblingEventTypes?: Record<
    string,
    { phasedRegistrationNames: { bubbled: string; captured: string; skipBubbling?: boolean } }
  >;
  directEventTypes?: Record<string, { registrationName: string }>;
};

// View configs of React Native built-in components. Keep in sync with `event-types.ts`.
const viewConfigModules = [
  'react-native/Libraries/NativeComponent/BaseViewConfig.ios',
  'react-native/Libraries/NativeComponent/BaseViewConfig.android',
  'react-native/Libraries/Components/ScrollView/ScrollViewNativeComponent',
  'react-native/Libraries/Components/TextInput/AndroidTextInputNativeComponent',
  'react-native/Libraries/Components/TextInput/RCTSingelineTextInputNativeComponent',
  'react-native/Libraries/Components/TextInput/RCTMultilineTextInputNativeComponent',
  'react-native/Libraries/Image/ImageViewNativeComponent',
  'react-native/src/private/components/modal/specs/RCTModalHostViewNativeComponent',
  'react-native/src/private/components/refreshcontrol/specs/AndroidSwipeRefreshLayoutNativeComponent',
  'react-native/src/private/components/refreshcontrol/specs/PullToRefreshViewNativeComponent',
  'react-native/src/private/components/switch/specs/SwitchNativeComponent',
  'react-native/src/private/components/switch/specs/AndroidSwitchNativeComponent',
  'react-native/src/private/components/drawerlayoutandroid/specs/AndroidDrawerLayoutNativeComponent',
];

// Present in Android base view config without the `top` prefix, not dispatched by RN core.
const ignoredEventTypes = new Set(['onGestureHandlerEvent', 'onGestureHandlerStateChange']);

function loadReactNativeEventTypes() {
  const bubbling: Record<string, boolean> = {};
  const direct = new Set<string>();

  for (const modulePath of viewConfigModules) {
    const module = jest.requireActual(modulePath);
    const viewConfig: ViewConfig = module.__INTERNAL_VIEW_CONFIG ?? module.default;

    for (const [topLevelType, config] of Object.entries(viewConfig.bubblingEventTypes ?? {})) {
      const type = toEventType(topLevelType);
      const { bubbled, captured, skipBubbling } = config.phasedRegistrationNames;
      // `event-types.ts` derives prop names from the event type.
      expect({ bubbled, captured }).toEqual({
        bubbled: topLevelType.replace(/^top/, 'on'),
        captured: `${bubbled}Capture`,
      });
      bubbling[type] = skipBubbling ?? false;
    }

    for (const [topLevelType, config] of Object.entries(viewConfig.directEventTypes ?? {})) {
      if (!ignoredEventTypes.has(topLevelType)) {
        expect(config.registrationName).toBe(topLevelType.replace(/^top/, 'on'));
        direct.add(toEventType(topLevelType));
      }
    }
  }

  return { bubbling, direct };
}

test('event types match React Native view configs', () => {
  const { bubbling, direct } = loadReactNativeEventTypes();

  expect(eventTypesForTesting.bubblingEventTypes).toEqual(bubbling);
  expect([...eventTypesForTesting.directEventTypes].sort()).toEqual([...direct].sort());
});

test('getEventTypeConfig() returns bubbling event config', () => {
  expect(getEventTypeConfig('pointerUp')).toEqual({
    kind: 'bubbling',
    type: 'pointerUp',
    bubbled: 'onPointerUp',
    captured: 'onPointerUpCapture',
    skipBubbling: false,
  });
  expect(getEventTypeConfig('onPointerEnter')).toMatchObject({ skipBubbling: true });
});

test('getEventTypeConfig() returns direct event config', () => {
  expect(getEventTypeConfig('topLayout')).toEqual({
    kind: 'direct',
    type: 'layout',
    registrationName: 'onLayout',
  });
});

test('getEventTypeConfig() returns null for unknown events', () => {
  expect(getEventTypeConfig('changeText')).toBeNull();
  expect(getEventTypeConfig('pressIn')).toBeNull();
});

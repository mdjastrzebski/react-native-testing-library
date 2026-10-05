import * as React from 'react';
import { View } from 'react-native';

import { render, screen, unstable_dispatchNativeEvent as dispatchNativeEvent } from '../..';
import { buildTouchNativeEvent } from '../builders/common';
import { getCurrentResponder, resetResponderState } from '../responder';

function touchStart(testId: string) {
  return dispatchNativeEvent(
    screen.getByTestId(testId),
    'touchStart',
    buildTouchNativeEvent('touchStart'),
  );
}

function touchMove(testId: string) {
  return dispatchNativeEvent(
    screen.getByTestId(testId),
    'touchMove',
    buildTouchNativeEvent('touchMove'),
  );
}

function touchEnd(testId: string) {
  return dispatchNativeEvent(
    screen.getByTestId(testId),
    'touchEnd',
    buildTouchNativeEvent('touchEnd'),
  );
}

afterEach(() => {
  resetResponderState();
});

test('grants responder to the deepest element that wants it', async () => {
  const parent = { onStartShouldSetResponder: jest.fn(() => true), onResponderGrant: jest.fn() };
  const child = {
    onStartShouldSetResponder: jest.fn(() => true),
    onResponderGrant: jest.fn(),
    onResponderStart: jest.fn(),
    onResponderEnd: jest.fn(),
    onResponderRelease: jest.fn(),
  };
  await render(
    <View testID="parent" {...parent}>
      <View testID="child" {...child} />
    </View>,
  );

  await touchStart('child');
  expect(child.onResponderGrant).toHaveBeenCalledTimes(1);
  expect(child.onResponderStart).toHaveBeenCalledTimes(1);
  expect(parent.onStartShouldSetResponder).not.toHaveBeenCalled();
  expect(parent.onResponderGrant).not.toHaveBeenCalled();
  expect(getCurrentResponder()).toBe(screen.getByTestId('child'));

  await touchEnd('child');
  expect(child.onResponderEnd).toHaveBeenCalledTimes(1);
  expect(child.onResponderRelease).toHaveBeenCalledTimes(1);
  expect(getCurrentResponder()).toBeNull();
});

test('responder events have target and currentTarget', async () => {
  const onResponderGrant = jest.fn((event) => {
    expect(event.target).toBe(screen.getByTestId('child'));
    expect(event.currentTarget).toBe(screen.getByTestId('parent'));
    expect(typeof event.currentTarget.measure).toBe('function');
  });
  await render(
    <View
      testID="parent"
      onStartShouldSetResponder={() => true}
      onResponderGrant={onResponderGrant}
    >
      <View testID="child" />
    </View>,
  );

  await touchStart('child');
  expect(onResponderGrant).toHaveBeenCalledTimes(1);
});

test('parent can claim responder in capture phase', async () => {
  const parent = {
    onStartShouldSetResponderCapture: jest.fn(() => true),
    onResponderGrant: jest.fn(),
  };
  const child = { onStartShouldSetResponder: jest.fn(() => true), onResponderGrant: jest.fn() };
  await render(
    <View testID="parent" {...parent}>
      <View testID="child" {...child} />
    </View>,
  );

  await touchStart('child');
  expect(parent.onResponderGrant).toHaveBeenCalledTimes(1);
  expect(child.onStartShouldSetResponder).not.toHaveBeenCalled();
  expect(child.onResponderGrant).not.toHaveBeenCalled();
});

test('no responder when nobody wants it', async () => {
  const onStartShouldSetResponder = jest.fn(() => false);
  const onResponderGrant = jest.fn();
  await render(
    <View
      testID="view"
      onStartShouldSetResponder={onStartShouldSetResponder}
      onResponderGrant={onResponderGrant}
    />,
  );

  await touchStart('view');
  expect(onStartShouldSetResponder).toHaveBeenCalledTimes(1);
  expect(onResponderGrant).not.toHaveBeenCalled();
  expect(getCurrentResponder()).toBeNull();
});

test('parent can take over responder on move', async () => {
  const parent = {
    onMoveShouldSetResponderCapture: jest.fn(() => true),
    onResponderGrant: jest.fn(),
    onResponderMove: jest.fn(),
  };
  const child = {
    onStartShouldSetResponder: () => true,
    onResponderGrant: jest.fn(),
    onResponderTerminationRequest: jest.fn(() => true),
    onResponderTerminate: jest.fn(),
  };
  await render(
    <View testID="parent" {...parent}>
      <View testID="child" {...child} />
    </View>,
  );

  await touchStart('child');
  expect(child.onResponderGrant).toHaveBeenCalledTimes(1);

  await touchMove('child');
  expect(child.onResponderTerminationRequest).toHaveBeenCalledTimes(1);
  expect(child.onResponderTerminate).toHaveBeenCalledTimes(1);
  expect(parent.onResponderGrant).toHaveBeenCalledTimes(1);
  expect(parent.onResponderMove).toHaveBeenCalledTimes(1);
  expect(getCurrentResponder()).toBe(screen.getByTestId('parent'));
});

test('responder can refuse termination', async () => {
  const parent = {
    onMoveShouldSetResponderCapture: () => true,
    onResponderGrant: jest.fn(),
    onResponderReject: jest.fn(),
  };
  const child = {
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderTerminate: jest.fn(),
    onResponderMove: jest.fn(),
  };
  await render(
    <View testID="parent" {...parent}>
      <View testID="child" {...child} />
    </View>,
  );

  await touchStart('child');
  await touchMove('child');
  expect(parent.onResponderReject).toHaveBeenCalledTimes(1);
  expect(child.onResponderTerminate).not.toHaveBeenCalled();
  expect(child.onResponderMove).toHaveBeenCalledTimes(1);
  expect(getCurrentResponder()).toBe(screen.getByTestId('child'));
});

test('touch cancel terminates responder', async () => {
  const onResponderTerminate = jest.fn();
  await render(
    <View
      testID="view"
      onStartShouldSetResponder={() => true}
      onResponderTerminate={onResponderTerminate}
    />,
  );

  await touchStart('view');
  await dispatchNativeEvent(screen.getByTestId('view'), 'touchCancel', {
    ...buildTouchNativeEvent('touchEnd'),
  });
  expect(onResponderTerminate).toHaveBeenCalledTimes(1);
  expect(getCurrentResponder()).toBeNull();
});

test('touch events bubble after responder events', async () => {
  const calls: string[] = [];
  await render(
    <View testID="parent" onTouchStart={() => calls.push('parent:touchStart')}>
      <View
        testID="child"
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => {
          calls.push('child:responderGrant');
        }}
        onTouchStart={() => calls.push('child:touchStart')}
      />
    </View>,
  );

  await touchStart('child');
  expect(calls).toEqual(['child:responderGrant', 'child:touchStart', 'parent:touchStart']);
});

test('rethrows responder handler errors after dispatch', async () => {
  const onTouchStart = jest.fn();
  await render(
    <View
      testID="view"
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => {
        throw new Error('Grant error');
      }}
      onTouchStart={onTouchStart}
    />,
  );

  await expect(touchStart('view')).rejects.toThrow('Grant error');
  expect(onTouchStart).toHaveBeenCalledTimes(1);
});

import * as React from 'react';
import { Text, View } from 'react-native';

import { render, screen, unstable_dispatchNativeEvent as dispatchNativeEvent } from '../..';
import type { SyntheticEvent } from '../synthetic-event';

test('calls target handler with event object', async () => {
  const onPointerUp = jest.fn();
  await render(<View testID="view" onPointerUp={onPointerUp} />);

  const view = screen.getByTestId('view');
  await dispatchNativeEvent(view, 'pointerUp', { x: 10, y: 20 });

  expect(onPointerUp).toHaveBeenCalledTimes(1);
  const event: SyntheticEvent = onPointerUp.mock.calls[0][0];
  expect(event.type).toBe('pointerUp');
  expect(event.nativeEvent).toEqual({ x: 10, y: 20 });
  expect(event.target).toBe(view);
  expect(event.bubbles).toBe(true);
  expect(event.isTrusted).toBe(true);
});

test('accepts event type with "on" and "top" prefixes', async () => {
  const onPointerUp = jest.fn();
  await render(<View testID="view" onPointerUp={onPointerUp} />);

  await dispatchNativeEvent(screen.getByTestId('view'), 'onPointerUp');
  await dispatchNativeEvent(screen.getByTestId('view'), 'topPointerUp');
  expect(onPointerUp).toHaveBeenCalledTimes(2);
});

test('bubbles to all handlers on the path', async () => {
  const onPointerUpGrandparent = jest.fn();
  const onPointerUpParent = jest.fn();
  await render(
    <View onPointerUp={onPointerUpGrandparent}>
      <View onPointerUp={onPointerUpParent}>
        <View testID="child" />
      </View>
    </View>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp');
  expect(onPointerUpParent).toHaveBeenCalledTimes(1);
  expect(onPointerUpGrandparent).toHaveBeenCalledTimes(1);
});

test('runs capture phase before bubble phase', async () => {
  const calls: string[] = [];
  const log = (name: string) => (event: unknown) => {
    const { currentTarget, eventPhase } = event as SyntheticEvent;
    calls.push(`${name}:${currentTarget?.props.testID}:${eventPhase}`);
  };

  await render(
    <View
      testID="parent"
      onPointerUpCapture={log('parent-capture')}
      onPointerUp={log('parent-bubble')}
    >
      <View
        testID="child"
        onPointerUpCapture={log('child-capture')}
        onPointerUp={log('child-bubble')}
      />
    </View>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp');
  expect(calls).toEqual([
    'parent-capture:parent:1',
    'child-capture:child:2',
    'child-bubble:child:2',
    'parent-bubble:parent:3',
  ]);
});

test('stopPropagation() in capture phase stops dispatch', async () => {
  const onPointerUpChild = jest.fn();
  const onPointerUpParent = jest.fn();
  await render(
    <View onPointerUpCapture={(event) => event.stopPropagation()} onPointerUp={onPointerUpParent}>
      <View testID="child" onPointerUp={onPointerUpChild} />
    </View>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp');
  expect(onPointerUpChild).not.toHaveBeenCalled();
  expect(onPointerUpParent).not.toHaveBeenCalled();
});

test('stopPropagation() in bubble phase stops bubbling', async () => {
  const onPointerUpParent = jest.fn();
  await render(
    <View onPointerUp={onPointerUpParent}>
      <View
        testID="child"
        onPointerUp={(event) => {
          event.stopPropagation();
          expect(event.isPropagationStopped()).toBe(true);
        }}
      />
    </View>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp');
  expect(onPointerUpParent).not.toHaveBeenCalled();
});

test('direct events are only dispatched to the target', async () => {
  const onLayoutParent = jest.fn();
  const onLayoutChild = jest.fn();
  await render(
    <View onLayout={onLayoutParent}>
      <View testID="child" onLayout={onLayoutChild} />
    </View>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'layout', {
    layout: { x: 0, y: 0, width: 100, height: 50 },
  });
  expect(onLayoutChild).toHaveBeenCalledTimes(1);
  expect(onLayoutChild.mock.calls[0][0].bubbles).toBe(false);
  expect(onLayoutParent).not.toHaveBeenCalled();
});

test('skipBubbling events have capture phase but do not bubble', async () => {
  const onPointerEnterCaptureParent = jest.fn();
  const onPointerEnterParent = jest.fn();
  const onPointerEnterChild = jest.fn();
  await render(
    <View onPointerEnterCapture={onPointerEnterCaptureParent} onPointerEnter={onPointerEnterParent}>
      <View testID="child" onPointerEnter={onPointerEnterChild} />
    </View>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'pointerEnter');
  expect(onPointerEnterCaptureParent).toHaveBeenCalledTimes(1);
  expect(onPointerEnterChild).toHaveBeenCalledTimes(1);
  expect(onPointerEnterParent).not.toHaveBeenCalled();
});

test('does not call props of composite components', async () => {
  const onPointerUp = jest.fn();
  // Composite component receives `onPointerUp` but does not pass it to host element.
  const Composite = (_props: { onPointerUp: () => void; children: React.ReactNode }) => (
    <View>{_props.children}</View>
  );

  await render(
    <Composite onPointerUp={onPointerUp}>
      <View testID="child" />
    </Composite>,
  );

  await dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp');
  expect(onPointerUp).not.toHaveBeenCalled();
});

test('does not dispatch events unknown to React Native', async () => {
  const onChangeText = jest.fn();
  await render(<View testID="view" {...{ onChangeText }} />);

  await expect(dispatchNativeEvent(screen.getByTestId('view'), 'changeText')).resolves.toBe(true);
  expect(onChangeText).not.toHaveBeenCalled();
});

test('returns false when a handler calls preventDefault()', async () => {
  await render(
    <View onPointerUp={(event) => event.preventDefault()}>
      <View testID="child" />
    </View>,
  );

  await expect(dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp')).resolves.toBe(false);
});

test('rethrows first handler error after calling all handlers', async () => {
  const onPointerUpParent = jest.fn();
  await render(
    <View onPointerUp={onPointerUpParent}>
      <View
        testID="child"
        onPointerUp={() => {
          throw new Error('Child error');
        }}
      />
    </View>,
  );

  await expect(dispatchNativeEvent(screen.getByTestId('child'), 'pointerUp')).rejects.toThrow(
    'Child error',
  );
  expect(onPointerUpParent).toHaveBeenCalledTimes(1);
});

test('does nothing for unmounted elements', async () => {
  const onPointerUp = jest.fn();
  const { rerender } = await render(<View testID="view" onPointerUp={onPointerUp} />);
  const view = screen.getByTestId('view');
  await rerender(<Text>Other</Text>);

  await dispatchNativeEvent(view, 'pointerUp');
  expect(onPointerUp).not.toHaveBeenCalled();
});

test('applies state updates from handlers', async () => {
  function Counter() {
    const [count, setCount] = React.useState(0);
    return (
      <View testID="view" onPointerUp={() => setCount((value) => value + 1)}>
        <Text>Count: {count}</Text>
      </View>
    );
  }

  await render(<Counter />);
  await dispatchNativeEvent(screen.getByTestId('view'), 'pointerUp');
  expect(screen.getByText('Count: 1')).toBeOnTheScreen();
});

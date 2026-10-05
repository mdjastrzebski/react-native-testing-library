import * as React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { configure, fireEvent, render, screen } from '../..';
import { _console } from '../../helpers/logger';
import { nativeState } from '../native-state';
import type { SyntheticEvent } from '../synthetic-event';

beforeEach(() => {
  configure({ unstable_nativeEventDispatch: true });
});

test('dispatches native events through capture and bubble phases', async () => {
  const calls: string[] = [];
  await render(
    <View onFocusCapture={() => calls.push('parent-capture')} onFocus={() => calls.push('parent')}>
      <TextInput testID="input" onFocus={() => calls.push('input')} />
    </View>,
  );

  await fireEvent(screen.getByTestId('input'), 'focus', { nativeEvent: { target: 1 } });
  expect(calls).toEqual(['parent-capture', 'input', 'parent']);
});

test('passes SyntheticEvent with nativeEvent from event data', async () => {
  const onPointerUp = jest.fn();
  await render(<View testID="view" onPointerUp={onPointerUp} />);

  const view = screen.getByTestId('view');
  await expect(
    fireEvent(view, 'onPointerUp', { nativeEvent: { pageX: 10 } }),
  ).resolves.toBeUndefined();

  const event: SyntheticEvent = onPointerUp.mock.calls[0][0];
  expect(event.type).toBe('pointerUp');
  expect(event.nativeEvent).toEqual({ pageX: 10 });
  expect(event.target).toBe(view);
});

test('dispatches native event with empty payload when no data is passed', async () => {
  const onPointerUp = jest.fn();
  await render(
    <View onPointerUp={onPointerUp}>
      <View testID="child" />
    </View>,
  );

  await fireEvent(screen.getByTestId('child'), 'pointerUp');
  expect(onPointerUp.mock.calls[0][0].nativeEvent).toEqual({});
});

test('stopPropagation() stops bubbling', async () => {
  const onFocusParent = jest.fn();
  await render(
    <View onFocus={onFocusParent}>
      <TextInput testID="input" onFocus={(event) => event.stopPropagation()} />
    </View>,
  );

  await fireEvent(screen.getByTestId('input'), 'focus');
  expect(onFocusParent).not.toHaveBeenCalled();
});

test('direct events are not dispatched to ancestors', async () => {
  const onScroll = jest.fn();
  await render(
    <ScrollView onScroll={onScroll}>
      <View testID="content" />
    </ScrollView>,
  );

  await fireEvent.scroll(screen.getByTestId('content'));
  expect(onScroll).not.toHaveBeenCalled();
});

test('warns when target has no handler for direct event', async () => {
  const warnSpy = jest.spyOn(_console, 'warn').mockImplementation(() => {});
  const onLayout = jest.fn();
  await render(
    <View onLayout={onLayout}>
      <View testID="child" />
    </View>,
  );

  await fireEvent.layout(screen.getByTestId('child'), { width: 100 });
  expect(onLayout).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenCalledTimes(1);
  warnSpy.mockRestore();
});

test('uses legacy subsystem for press on composite components', async () => {
  const onPress = jest.fn();
  await render(
    <Pressable onPress={onPress}>
      <Text>Press me</Text>
    </Pressable>,
  );

  await fireEvent.press(screen.getByText('Press me'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('uses legacy subsystem for events unknown to React Native', async () => {
  const onChangeText = jest.fn();
  const onCustomEvent = jest.fn(() => 'result');
  function Custom(_props: { onCustomEvent: () => string; children: React.ReactNode }) {
    return <View>{_props.children}</View>;
  }

  await render(
    <Custom onCustomEvent={onCustomEvent}>
      <TextInput testID="input" onChangeText={onChangeText} />
    </Custom>,
  );

  const input = screen.getByTestId('input');
  await fireEvent.changeText(input, 'Hello');
  expect(onChangeText).toHaveBeenCalledWith('Hello');
  await expect(fireEvent(input, 'customEvent', 'arg')).resolves.toBe('result');
  expect(onCustomEvent).toHaveBeenCalledWith('arg');
});

test('uses legacy subsystem when event data has no nativeEvent', async () => {
  const onFocus = jest.fn();
  await render(<TextInput testID="input" onFocus={onFocus} />);

  await fireEvent(screen.getByTestId('input'), 'focus', 'custom-arg');
  expect(onFocus).toHaveBeenCalledWith('custom-arg');
});

test('non-editable TextInput blocks editing events, including from nested Text', async () => {
  const onFocus = jest.fn();
  const onSubmitEditing = jest.fn();
  const onLayout = jest.fn();
  await render(
    <TextInput
      testID="input"
      editable={false}
      onFocus={onFocus}
      onSubmitEditing={onSubmitEditing}
      onLayout={onLayout}
    >
      <Text>Nested</Text>
    </TextInput>,
  );

  await fireEvent(screen.getByTestId('input'), 'focus');
  await fireEvent(screen.getByText('Nested'), 'focus');
  await fireEvent(screen.getByText('Nested'), 'submitEditing', { nativeEvent: { text: 'a' } });
  await fireEvent.layout(screen.getByTestId('input'), { height: 40 });

  expect(onFocus).not.toHaveBeenCalled();
  expect(onSubmitEditing).not.toHaveBeenCalled();
  expect(onLayout).toHaveBeenCalledTimes(1);
});

test('updates native state for native events', async () => {
  const onScroll = jest.fn();
  await render(<ScrollView testID="scroll" onScroll={onScroll} />);

  await fireEvent.scroll(screen.getByTestId('scroll'), {
    nativeEvent: { contentOffset: { x: 0, y: 200 } },
  });
  const scrollView = screen.getByTestId('scroll');
  expect(onScroll.mock.calls[0][0].nativeEvent.contentOffset).toEqual({ x: 0, y: 200 });
  expect(nativeState.contentOffsetForInstance.get(scrollView)).toEqual({ x: 0, y: 200 });
});

test('does nothing when element is unmounted', async () => {
  const onFocus = jest.fn();
  const { rerender } = await render(<TextInput testID="input" onFocus={onFocus} />);
  const input = screen.getByTestId('input');
  await rerender(<View />);

  await fireEvent(input, 'focus');
  expect(onFocus).not.toHaveBeenCalled();
});

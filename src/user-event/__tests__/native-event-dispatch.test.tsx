import * as React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { configure, render, screen, userEvent } from '../..';

beforeEach(() => {
  configure({ unstable_nativeEventDispatch: true });
});

test('press() works on Pressable', async () => {
  const onPressIn = jest.fn();
  const onPressOut = jest.fn();
  const onPress = jest.fn();
  await render(
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress}>
      <Text>Press me</Text>
    </Pressable>,
  );

  const user = userEvent.setup();
  await user.press(screen.getByText('Press me'));
  expect(onPressIn).toHaveBeenCalledTimes(1);
  expect(onPressOut).toHaveBeenCalledTimes(1);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('longPress() works on Pressable', async () => {
  const onPress = jest.fn();
  const onLongPress = jest.fn();
  await render(
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <Text>Press me</Text>
    </Pressable>,
  );

  const user = userEvent.setup();
  await user.longPress(screen.getByText('Press me'));
  expect(onLongPress).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled();
});

test('press() only triggers the innermost Pressable', async () => {
  const onPressOuter = jest.fn();
  const onPressInner = jest.fn();
  await render(
    <Pressable onPress={onPressOuter}>
      <Pressable onPress={onPressInner}>
        <Text>Inner</Text>
      </Pressable>
    </Pressable>,
  );

  const user = userEvent.setup();
  await user.press(screen.getByText('Inner'));
  expect(onPressInner).toHaveBeenCalledTimes(1);
  expect(onPressOuter).not.toHaveBeenCalled();
});

test('press() does not trigger disabled Pressable', async () => {
  const onPress = jest.fn();
  await render(
    <Pressable disabled onPress={onPress}>
      <Text>Press me</Text>
    </Pressable>,
  );

  const user = userEvent.setup();
  await user.press(screen.getByText('Press me'));
  expect(onPress).not.toHaveBeenCalled();
});

test('press() lets parent claim the touch in capture phase', async () => {
  const onPress = jest.fn();
  const onResponderGrant = jest.fn();
  await render(
    <View onStartShouldSetResponderCapture={() => true} onResponderGrant={onResponderGrant}>
      <Pressable onPress={onPress}>
        <Text>Press me</Text>
      </Pressable>
    </View>,
  );

  const user = userEvent.setup();
  await user.press(screen.getByText('Press me'));
  expect(onResponderGrant).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled();
});

test('press() dispatches touch events that bubble to ancestors', async () => {
  const onTouchStart = jest.fn();
  const onTouchEnd = jest.fn();
  await render(
    <View onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Pressable onPress={() => {}}>
        <Text>Press me</Text>
      </Pressable>
    </View>,
  );

  const user = userEvent.setup();
  await user.press(screen.getByText('Press me'));
  expect(onTouchStart).toHaveBeenCalledTimes(1);
  expect(onTouchEnd).toHaveBeenCalledTimes(1);
});

test('type() events bubble and can be captured by ancestors', async () => {
  const onFocusCapture = jest.fn();
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  const onChangeText = jest.fn();
  await render(
    <View onFocusCapture={onFocusCapture} onFocus={onFocus} onBlur={onBlur}>
      <TextInput testID="input" onChangeText={onChangeText} />
    </View>,
  );

  const user = userEvent.setup();
  await user.type(screen.getByTestId('input'), 'abc');
  expect(onFocusCapture).toHaveBeenCalledTimes(1);
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(onChangeText).toHaveBeenLastCalledWith('abc');
});

test('stopPropagation() in TextInput handler stops bubbling', async () => {
  const onFocusParent = jest.fn();
  await render(
    <View onFocus={onFocusParent}>
      <TextInput testID="input" onFocus={(event) => event.stopPropagation()} />
    </View>,
  );

  const user = userEvent.setup();
  await user.type(screen.getByTestId('input'), 'a');
  expect(onFocusParent).not.toHaveBeenCalled();
});

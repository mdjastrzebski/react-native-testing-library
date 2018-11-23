// @flow
/* eslint-disable react/no-multi-comp */
import React from 'react';
import {
  Image,
  Text,
  TextInput,
  Modal,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Button,
} from 'react-native';

import { render, fireEvent } from '..';

class RNComponents extends React.Component<*> {
  render() {
    return (
      <View>
        <Modal visible>
          <ScrollView>
            <Image />
            <TextInput value="value" />
            <TouchableOpacity onPress={() => {}}>
              <Text>t1</Text>
              <Text>t2</Text>
              <Text>t3</Text>
            </TouchableOpacity>
            <ActivityIndicator />
          </ScrollView>
        </Modal>
      </View>
    );
  }
}

class AppWithFlatList extends React.Component {
  state = {
    projects: [
      { name: 'Super Important Project A', id: '01' },
      { name: 'Super Important Project B', id: '02' },
      { name: 'Super Important Project C', id: '03' },
    ],
  };

  render() {
    const Project = ({ name }) => <Text>{name}</Text>;
    return (
      <View>
        <Text testID="header">
          After this text, we should have the FlatList with the Projects
        </Text>
        <Button
          title="remove last"
          onPress={() =>
            this.setState(state => ({ projects: state.projects.slice(0, 2) }))
          }
        />
        <FlatList
          data={this.state.projects}
          renderItem={({ item }) => <Project name={item.name} />}
          keyExtractor={({ id }) => id}
          ListEmptyComponent={<Text>There are no projects</Text>}
        />
      </View>
    );
  }
}

test('FlatList', () => {
  const { debug, getByText } = render(<AppWithFlatList />);
  debug(); // renders 3 elements
  fireEvent.press(getByText('remove last'));
  debug(); // renders 2 elements
});

test('getByName smoke test to see how unstable it gets', () => {
  const { getByName } = render(<RNComponents />);
  expect(() => getByName('Image')).toThrow(); // – doesn't have displayName set properly
  getByName('TextInput');
  expect(() => getByName('Modal')).toThrow(); // – doesn't have displayName set properly
  getByName('View');
  getByName('ScrollView');
  expect(() => getByName('ActivityIndicator')).toThrow(); // – doesn't have displayName set properly
  getByName('TouchableOpacity');
});

test('getAllByName smoke test to see how unstable it gets', () => {
  const { getAllByName } = render(<RNComponents />);

  const [t1, t2, t3] = getAllByName('Text');
  expect(t1.props.children).toBe('t1');
  expect(t2.props.children).toBe('t2');
  expect(t3.props.children).toBe('t3');
});

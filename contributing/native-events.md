# Native Event Propagation

In React Native, some events **bubble** up to parent elements and others are **direct**, meaning only the element that emitted them receives them. `fireEvent` should behave the same way.

With the legacy event subsystem, `fireEvent` treats every event as bubbling except `layout`. The list of direct events lives in `isDirectEvent()` in `src/events/legacy/propagation.ts`.

The experimental native subsystem (`unstable_nativeEventDispatch`, see [Event dispatch](event-dispatch.md)) reads bubbling and direct events from `src/events/event-types.ts`, a copy of React Native's view configs that `event-types.test.ts` checks against the installed `react-native`.

## Which events are which

There is no simple rule for which events bubble. Coming from user input doesn't make an event bubble: `scroll` and `refresh` start with a user gesture but are direct. Check the lists below rather than guessing.

**Bubbling:** `press`, `change`, `focus`, `blur`, `submitEditing`, `endEditing`, `keyPress`, and touch and pointer events (`touchStart`, `pointerDown`, etc.).

**Direct:**

| Component        | Direct events                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------- |
| All components   | `layout`, accessibility actions                                                          |
| `ScrollView`     | `scroll`, `scrollBeginDrag`, `scrollEndDrag`, `momentumScrollBegin`, `momentumScrollEnd` |
| `TextInput`      | `scroll`, `selectionChange`, `contentSizeChange`                                         |
| `Text`           | `textLayout`                                                                             |
| `Image`          | `loadStart`, `progress`, `load`, `error`, `loadEnd`                                      |
| `Modal`          | `requestClose`, `show`, `dismiss`, `orientationChange`                                   |
| `RefreshControl` | `refresh`                                                                                |

This is simplified. A few events differ between iOS and Android. Check the sources below for the exact details.

## Known gaps

With the legacy subsystem, all the direct events above except `layout` still bubble in `fireEvent`. Fixing that is a breaking change: tests that fire these events on a child element would stop reaching the parent's handler.

## Sources

The table is based on `react-native@0.88.0-rc.1`. Re-check it after React Native upgrades. In `node_modules/react-native`:

- Events shared by all components: `Libraries/NativeComponent/BaseViewConfig.{ios,android}.js`
- Component-specific events: each component's `*NativeComponent.js` or `*ViewConfig.js` file
- Newer components: `src/private/components/*/specs/`, where `DirectEventHandler` and `BubblingEventHandler` prop types mark each event

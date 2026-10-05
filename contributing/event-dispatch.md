# Event Dispatch: `fireEvent` vs `userEvent`

RNTL has two ways to trigger events: `fireEvent` and `userEvent`. Neither goes through React Native's own renderer. Both call `on*` props in the rendered tree inside `act()`, using one of two event subsystems in `src/events/`:

- **Legacy** (default, `src/events/legacy/`): finds `on*` handlers in props and calls them directly.
- **Native** (experimental, `configure({ unstable_nativeEventDispatch: true })`): `dispatchNativeEvent()` mirrors how React Native dispatches events from native code. It runs responder negotiation, then a capture phase and a bubble phase over host elements, passing a `SyntheticEvent`.

`getNativeEventPayload()` in `event-subsystem.ts` picks the subsystem for each event. The native subsystem handles an event when the flag is on, React Native knows the event type (see `event-types.ts`), and the event data is missing or has a `nativeEvent` object. Everything else uses the legacy subsystem. That includes component callbacks that Jest mocks pass to host elements, like `changeText` and `press`.

| File                                         | Contents                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `fire-event.ts`                              | Public `fireEvent` API, routes to either subsystem                                               |
| `dispatch.ts`                                | `dispatchEvent()` used by `userEvent`, routes to either subsystem                                |
| `event-subsystem.ts`                         | Picks the subsystem for an event                                                                 |
| `handler.ts`                                 | Finding the `on*` handler for an event name in props                                             |
| `is-enabled.ts`                              | Shared checks: `pointerEvents`, and editing events of a non-editable `TextInput`                 |
| `builders/`                                  | Event payloads, matching what React Native sends on a device                                     |
| `native-state.ts`, `update-native-state.ts`  | [Native state](native-state.md) and how `fireEvent` updates it                                   |
| `legacy/propagation.ts`                      | Legacy bubbling: walks up host and composite elements to the first enabled handler               |
| `legacy/is-enabled.ts`                       | Legacy per-handler checks: `pointerEvents`, non-editable `TextInput`, declining touch responders |
| `legacy/fire-event.ts`, `legacy/dispatch.ts` | Legacy `fireEvent` and `dispatchEvent` implementations                                           |
| `dispatch-native-event.ts`                   | Native subsystem: capture and bubble phases over host elements                                   |
| `event-types.ts`                             | Bubbling and direct event types, copied from React Native view configs                           |
| `synthetic-event.ts`                         | Event object passed to handlers by the native subsystem                                          |
| `responder.ts`                               | Port of React Native's responder system                                                          |
| `host-path.ts`                               | Host element path helpers for the native subsystem                                               |

`src/user-event/` is a separate module on top of `src/events/` and imports it only through `src/events/index.ts`.

## `fireEvent`

`src/events/fire-event.ts` is the public API. It fires a single event.

With the legacy subsystem, it calls a single handler found with `findEventHandler()` from `src/events/legacy/propagation.ts`, and returns that handler's result:

- It starts at the target and moves up the tree until it finds a handler. It also checks props of composite components, not only host elements.
- Direct events (see [Native event propagation](native-events.md)) only check the target.
- It mimics cases where a device would not deliver the event, like `pointerEvents`, a non-editable `TextInput`, or a touch responder that declines.

With the native subsystem, it dispatches `data[0].nativeEvent` with `dispatchNativeEvent()`, which calls every handler on the host path, and returns `undefined`. A non-editable `TextInput` and its children emit no editing events.

## `userEvent`

`src/user-event/` simulates a whole interaction (press, type, scroll, …) as a realistic sequence of events with delays between them. The sequences are based on how React Native behaves on real devices.

Each step uses `dispatchEvent()`. With the legacy subsystem, it only calls the target's own handler. It doesn't bubble or check whether the element is enabled: each action does those checks itself, so the rules for an interaction live in one place. With the native subsystem, events propagate like on a device, and `press()` sends `touchStart` and `touchEnd` so that the responder system picks the handler.

## Guidelines

- To change which handler gets a single event, change `fireEvent`. To make an interaction more realistic, change the `userEvent` action.
- Keep `dispatchEvent()` simple.
- Put event rules that both need, like the `pointerEvents` and `editable` checks, in `src/events/`. They may build on general helpers from `src/helpers/` (for example `isEditableTextInput`). Code used only by `userEvent`, like delays and scroll steps, stays in `src/user-event/`.
- Event sequences should match a real device. Check on a device before changing one, and keep the code comments explaining the observed behavior.

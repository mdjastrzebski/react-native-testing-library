# Proposal: RN-style `dispatchEvent` for RNTL

Status: draft for discussion. Based on `facebook/react-native@main` (`024b474`) and RNTL `main` (`d33cb7e`).

## 1. How React Native dispatches events

RN `main` has a new pipeline, gated by `enableNativeEventTargetEventDispatching` (default `true` in JS; `ossReleaseStage: 'none'`, so OSS releases still use the legacy plugin system). The two systems behave the same way from a handler's point of view (two-phase capture/bubble over host instances, direct events, responder negotiation). The new one is much easier to read and copy.

```
native ──► ReactFabric.dispatchEvent(fiber, 'topPointerUp', payload)        Libraries/Renderer/implementations/ReactFabric-dev.js:1287
            └─ batchedUpdates
               ├─ RawEventEmitter.emit(...)
               └─ dispatchNativeEvent(publicInstance, topType, payload)    src/private/renderer/events/dispatchNativeEvent.js
                   1. processResponderEvent(...)                           src/private/renderer/events/ReactNativeResponder.js
                   2. look up topType in ViewConfigRegistry
                      customBubblingEventTypes / customDirectEventTypes
                      ├─ unknown          → dropped
                      ├─ direct           → rnIsDirect: true, bubbles: false
                      └─ bubbling         → bubbles: !skipBubbling
                   3. new LegacySyntheticEvent('pointerup', {bubbles, cancelable: true}, payload, dispatchConfig)
                      + pre-resolved prop names ('onPointerUp' / 'onPointerUpCapture')
                   4. dispatchTrustedEvent(target, event, rethrowListenerErrors = true)
                        EventTarget.dispatch()                              src/private/webapis/dom/events/EventTarget.js
                        path = direct ? [target] : target → … → root (via parentNode, host nodes only)
                        capture: root → target, call props[onXCapture] + capture listeners
                        bubble:  target → root (only target if !bubbles), call props[onX] + listeners
                        stopPropagation / stopImmediatePropagation honored
                        first listener error rethrown after the whole dispatch
```

Main points:

- **Only host elements are on the path.** `ReactNativeElement[EVENT_TARGET_GET_DECLARATIVE_LISTENER_KEY]` reads the host's current props. Composite props (`Pressable.onPress`) are never visited.
- **Every handler on the path runs.** Bubbling doesn't stop at the first handler, only on `stopPropagation()`.
- **Whether an event bubbles comes from data, not code.** RN keeps one global table keyed by event type, filled from view configs (`BaseViewConfig.{ios,android}.js` plus each component's `__INTERNAL_VIEW_CONFIG`). `skipBubbling` (`pointerEnter`, `pointerLeave`) means "capture phase plus target only".
- **The event object** is a W3C `Event` with RN compatibility extras: `type`, `bubbles`, `cancelable`, `target`, `currentTarget` (host element), `eventPhase`, `timeStamp` (taken from `payload.timestamp`), `nativeEvent`, `dispatchConfig`, `preventDefault`/`defaultPrevented`/`isDefaultPrevented()`, `stopPropagation`/`isPropagationStopped()`, `stopImmediatePropagation`, and a no-op `persist()`.
- **Responder system.** Runs before normal dispatch, but only for `topTouchStart/Move/End/Cancel`, `topScroll` and `topSelectionChange`. It negotiates by capture-then-bubble over `on*ShouldSetResponder{Capture}`, then sends `responderGrant / TerminationRequest / Terminate / Reject / Start / Move / End / Release` to the winner. `Pressable`'s `onPress` sits on top of this through Pressability's `onResponderGrant`/`onResponderRelease` host props.
- **Hit testing is native.** `pointerEvents` and non-editable inputs decide _which_ element gets the event before JS sees it. They are not checked per handler.

RN's own test tool, Fantom, gets this by running the real C++ runtime: `Fantom.dispatchNativeEvent(ref, 'onPointerUp', payload)`. RNTL can't do that. Under `@react-native/jest-preset`, `NativeComponentRegistry`/`requireNativeComponent` are mocked, so the view config registry stays **empty** and `TextInput`/`Text`/`ScrollView`/`Image`/`Modal` are mock components that pass JS-level props (`onChangeText`, `onPress`) through to host elements.

## 2. Where RNTL differs today

| Aspect                       | React Native                               | RNTL `fireEvent`                                    | RNTL `dispatchEvent` (userEvent)                               |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------- |
| Path                         | host ancestors                             | host ancestors **and composite props** (fiber walk) | target only                                                    |
| Handlers called              | all on path, capture and bubble            | the **first** enabled one                           | target's own                                                   |
| Capture phase (`onXCapture`) | yes                                        | no                                                  | no                                                             |
| Direct events                | from view config                           | only `layout` (hard-coded)                          | n/a                                                            |
| `stopPropagation`            | works                                      | no-op stub                                          | no-op stub                                                     |
| `target` / `currentTarget`   | host element                               | `{}` / stub with `measure`                          | same                                                           |
| Enabled checks               | native hit test, before JS                 | per handler during the walk                         | per action in userEvent                                        |
| Responder                    | negotiated                                 | short-circuit (`isTouchResponder`)                  | `responderGrant`/`Release` sent straight to the Pressable host |
| `act`                        | `batchedUpdates` around the whole dispatch | one `act` per call                                  | one `act` per call                                             |

`fireEvent` is a deliberate escape hatch (pick a handler, pass any args) and should stay that way. The gap that matters is in `userEvent`: it's meant to be realistic, but `src/events/dispatch.ts` calls a single handler. As a result, parent `onFocus`/`onBlur`/`onKeyPress`/`onTouch*` handlers and all `*Capture` handlers never run, and `e.stopPropagation()` does nothing.

## 3. Proposed design

All of this is internal and lives in `src/events/`, mirroring the RN modules one-to-one so later RN changes are easy to diff against.

### 3.1 Event type registry — `src/events/event-types.ts` (mirrors `ReactNativeEventTypeMapping.js`)

```ts
type EventTypeConfig =
  | { kind: 'bubbling'; bubbled: string; captured: string; skipBubbling?: boolean }
  | { kind: 'direct'; registrationName: string };

export function getEventTypeConfig(type: string): EventTypeConfig | null;
// accepts 'pointerUp' | 'onPointerUp' | 'topPointerUp' | 'pointerup'
```

- A **static, checked-in table** generated from RN's `BaseViewConfig.ios.js` and `BaseViewConfig.android.js` (union) plus the `__INTERNAL_VIEW_CONFIG`s of `ScrollView`, `TextInput`, `Image` and `Modal`. It's a single global table because RN's registry is global too (keyed by `topLevelType`, first registration wins).
- The registry can't be read at runtime: it's empty under the jest preset, and deep imports of `BaseViewConfig.*` are platform-resolved and private.
- Add an RNTL-only test that `require`s those RN files from `node_modules` and diffs them against the table, so an RN upgrade that changes events fails CI. `contributing/native-events.md` then points at the table instead of a hand-maintained list.
- **Events not in the table** (`changeText`, `press`, `pressIn`, `longPress` and other mock-passed JS callbacks) are treated as direct: target only, no capture. That matches what they really are, component callbacks rather than native events.

### 3.2 Event object — `src/events/event.ts` (mirrors `LegacySyntheticEvent.js` + `Event.js`)

A small `RntlEvent` class with the same public shape as `LegacySyntheticEvent`: `type`, `bubbles`, `cancelable`, `nativeEvent`, `dispatchConfig`, `target`, `currentTarget`, `eventPhase`, `timeStamp`, `defaultPrevented`, `preventDefault()`, `isDefaultPrevented()`, `stopPropagation()`, `isPropagationStopped()`, `stopImmediatePropagation()`, `persist()` (no-op), `isPersistent()`.

- Builders in `src/events/builders/` change to return **only the `nativeEvent` payload**. `baseSyntheticEvent()` goes away because the class provides those members, and they now actually work.
- `target`/`currentTarget` are set per step to the host's public instance (what a `ref` receives). Pressability calls `event.currentTarget.measure`, and the jest preset's mock component instances provide it. _Open question:_ confirm `test-renderer` exposes the public instance for a `TestInstance`; otherwise keep the `measure` stub.

### 3.3 Dispatcher — `src/events/dispatch.ts` (mirrors `dispatchNativeEvent` + `EventTarget.dispatch`)

```ts
export async function dispatchEvent(
  target: TestInstance,
  type: string, // 'focus', 'pointerUp', 'touchStart', 'changeText', …
  nativeEvent: object = {},
): Promise<boolean>; // !event.defaultPrevented
```

Algorithm (all inside **one** `act()`, like `batchedUpdates`):

1. Return early if `target` is unmounted.
2. `config = getEventTypeConfig(type)`, then build `RntlEvent`.
3. Path: direct or unknown gives `[target]`; otherwise the `instance.parent` chain. Host instances only, with **no fiber or composite walk**.
4. Capture phase, root → target: call `props[captured]` with `eventPhase` and `currentTarget` set. Break if propagation is stopped.
5. Bubble phase, target → root: call `props[bubbled]` (only the target when `!bubbles`). Break if propagation is stopped. `stopImmediatePropagation` acts like `stopPropagation` here, since there's one prop listener per node.
6. Catch the first handler error, finish the dispatch, then rethrow (RN's trusted-dispatch behaviour). Reset phase and `currentTarget`.

Fallback behaviour stays the same: if a handler name isn't in props, try `testOnly_on*` as `getEventHandlerFromProps` does now.

### 3.4 Enabled checks stay out of the dispatcher

RN filters by hit testing before dispatch, so `isPointerEventEnabled` / `isEventEnabled` stay **pre-dispatch gates** in the caller (`userEvent` actions, and `fireEvent`'s handler search). `dispatchEvent` stays as dumb as RN's `dispatch()`, in line with the existing "keep `dispatchEvent()` simple" guideline.

### 3.5 Responder emulation (phase 2) — `src/events/responder.ts` (mirrors `ReactNativeResponder.js`)

Port negotiation and the lifecycle for `touchStart/Move/End/Cancel`. Track the module-level `responderNode` and reset it in `cleanup()`. `dispatchEvent` calls it first, like `processResponderEvent`. Then:

```ts
// userEvent.press, conceptually
await dispatchEvent(target, 'touchStart', touch); // → negotiation → onResponderGrant → Pressability pressIn
await wait(duration);
await dispatchEvent(target, 'touchEnd', touch); // → onResponderRelease → pressOut → onPress
```

This replaces `isEnabledTouchResponder`, `emitPressabilityPressEvents` and the `onStartShouldSetResponder` heuristics in `is-enabled.ts`. As a result, nested pressables, parents with `onStartShouldSetResponderCapture`, `onTouchStart` on ancestors, and `onResponderTerminationRequest` all behave as they do on a device. `emitDirectPressEvents` stays for mock `Text`/host elements that carry `onPress` directly.

### 3.6 Public API

- Keep `fireEvent` semantics as they are for now; it's the documented "call this handler" tool.
- Optionally expose the new primitive as `unstable_dispatchNativeEvent(element, type, payload)`, named after `Fantom.dispatchNativeEvent`, for library authors who want RN-faithful propagation.

## 4. Rollout

1. **Phase 1, internal, no API change.** Add the registry, the event class and the new `dispatchEvent`. Switch `userEvent` over. Observable changes: ancestor and `*Capture` handlers now fire for bubbling events that `userEvent` emits (`focus`, `blur`, `change`, `keyPress`, `submitEditing`, `endEditing`), and `stopPropagation` works. That's more faithful but can break tests that assumed isolation, so ship it in a major release or behind `configure({ realisticEventPropagation: true })` for one minor.
2. **Phase 2.** Responder emulation; `userEvent.press`/`longPress` driven by touch events.
3. **Phase 3, breaking.** `fireEvent` derives `isDirectEvent` from the registry, which fixes the known gap in `contributing/native-events.md`. Optionally make `fireEvent` call every handler on the path instead of the first one.

## 5. Risks and open questions

- **Mock-specific host props.** Jest mocks put JS-level props on hosts (`onChangeText` on mock `TextInput`). Treating unknown types as direct keeps today's behaviour. Real `TextInput` would instead route `change` to `_onChange`, which then calls `onChangeText`. We don't control that, so keep sending both events as `type()` does now.
- **iOS/Android differences.** A few events differ between the platform base configs. A union table is simplest. Per-platform tables (picked by `Platform.OS`) are possible if a test needs them.
- **RN flag status.** The EventTarget pipeline isn't in OSS releases yet, but propagation semantics match the legacy `traverseTwoPhase` / `accumulateDirectDispatches` path (`ReactFabric-dev.js:1196-1219`). So the design is right for both, and RNTL doesn't depend on the flag.
- **`addEventListener` on refs.** Out of scope. `test-renderer` host instances aren't `EventTarget`s. Could be added later with a `WeakMap` of listeners keyed by `TestInstance`.
- **Performance.** The path walk is O(depth) per event, which is negligible next to `act()`.

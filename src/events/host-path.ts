import type { TestInstance } from 'test-renderer';

import { getEventHandlerFromProps } from './handler';
import type { EventHandler } from './types';

/**
 * Returns the parent host element, or `null` for top-level elements.
 * The root container is not an element, so it is never part of the event path.
 */
export function getHostParent(instance: TestInstance): TestInstance | null {
  const parent = instance.parent;
  if (parent?.parent == null) {
    return null;
  }

  return parent;
}

/**
 * Returns the event path: the target first, then its host ancestors up to the top-level element.
 * Mirrors the DOM "event path" that React Native builds from `parentNode`.
 */
export function getHostPath(target: TestInstance): TestInstance[] {
  const path: TestInstance[] = [];
  let current: TestInstance | null = target;
  while (current != null) {
    path.push(current);
    current = getHostParent(current);
  }

  return path;
}

/**
 * Returns the handler registered under exact prop name (e.g. `onPointerUpCapture`), if any.
 */
export function getPropHandler(instance: TestInstance, propName: string): EventHandler | undefined {
  return getEventHandlerFromProps(instance.props, propName);
}

const noop = () => {};

/**
 * Host elements on a device have `measure*` methods, and Pressability calls
 * `event.currentTarget.measure()`. Test instances do not, so add no-op versions.
 *
 * POC: ideally `test-renderer` would let RNTL provide the public instance for host elements.
 */
export function ensureHostMethods(instance: TestInstance) {
  for (const method of ['measure', 'measureInWindow', 'measureLayout']) {
    if (!(method in instance)) {
      Object.defineProperty(instance, method, { value: noop, enumerable: false });
    }
  }
}

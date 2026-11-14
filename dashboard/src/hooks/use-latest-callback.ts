import React from "react";

/**
 * A function that keeps one identity for the component's life and always calls the latest `fn`. For handing a parent's
 * handler, often new on every render, to memoised children (map pins, list rows, chart ticks) without re-rendering every
 * one of them each time the parent does. An absent `fn` makes the call a no-op; callers that hide a control without one
 * pass `fn ? stable : undefined` themselves.
 */
export function useLatestCallback<A extends unknown[], R>(fn: ((...args: A) => R) | undefined): (...args: A) => R | undefined {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  return React.useCallback((...args: A) => ref.current?.(...args), []);
}

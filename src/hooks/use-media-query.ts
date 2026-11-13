"use client";

import React from "react";

/**
 * Whether a CSS media query matches. `undefined` on the server and for the
 * hydration render, so what the client first paints agrees with the server
 * markup; the real answer lands in the same frame, before anything is shown.
 * Client-side navigations get the answer on the first render.
 */
export const useMediaQuery = (query: string): boolean | undefined =>
  React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => undefined,
  );

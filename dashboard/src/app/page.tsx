"use client";

import React from "react";
import MapPage from "./map/page";

export default function HomePage() {
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      window.history.replaceState(null, "", `/map${window.location.hash}`);
    }
  }, []);

  return <MapPage />;
}

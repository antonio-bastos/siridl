"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { selectedAnomalyRefOf, withSelectedAnomalyRef } from "@/models/road-anomalies";

export default function LegacyMarketRedirectPage() {
  const router = useRouter();

  React.useEffect(() => {
    const search = window.location.search ?? "";
    const ref = selectedAnomalyRefOf(window.location.hash);
    const hash = ref ? `#${withSelectedAnomalyRef("", ref)}` : "";
    router.replace(`/map${search}${hash}`);
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-xs text-muted-foreground">
      A redirecionar para o mapa de anomalias…
    </div>
  );
}

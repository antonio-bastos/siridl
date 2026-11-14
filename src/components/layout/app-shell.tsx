"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, MapPin, Moon, PanelLeftClose, PanelLeftOpen, Radar, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SIRI_ANOMALIES } from "@/models/siri-potholes";

export interface AppShellProps {
  children: React.ReactNode;
}

type NavItem = {
  label: string;
  hint: string;
  href: string;
  match: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  external?: boolean;
};

// Hick's / Miller's law: two small, labelled groups instead of one long list.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Monitorização",
    items: [
      {
        label: "Mapa de vias",
        hint: "Pinos no Concelho de Loulé",
        href: "/map",
        match: "/map",
        icon: MapPin,
      },
    ],
  },
  {
    title: "Modelo",
    items: [
      {
        label: "Feed de deteções",
        hint: "API JSON YOLOv11s",
        href: "/api/detections",
        match: "/api/detections",
        icon: Cpu,
        external: true,
      },
    ],
  },
];

const THEME_KEY = "siridl:theme";
const RAIL_KEY = "siridl:rail";

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [dark, setDark] = React.useState(false);

  // Jakob's law: remember theme + rail like every other app does.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", isDark);
      setDark(isDark);
      setSidebarOpen(window.localStorage.getItem(RAIL_KEY) !== "closed");
    } catch {
      // storage unavailable — keep defaults
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
  };

  const toggleRail = () => {
    setSidebarOpen((v) => {
      try {
        window.localStorage.setItem(RAIL_KEY, v ? "closed" : "open");
      } catch {}
      return !v;
    });
  };

  // Keyboard shortcut: "[" toggles the rail (common in Linear/Notion/Figma).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) toggleRail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
          "transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]",
          sidebarOpen ? "w-64" : "w-[72px]",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-[oklch(0.62_0.12_200)] text-sidebar-primary-foreground shadow-[0_1px_0_oklch(1_0_0/0.35)_inset,0_6px_16px_-4px_oklch(0.6_0.12_190/0.6)]">
            <Radar className="size-5" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-sidebar bg-signal" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold tracking-tight">SIRI-DL</p>
              <p className="truncate text-xs text-sidebar-foreground/55">Inteligência viária de Loulé</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 px-3 pt-3" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              {sidebarOpen ? (
                <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/40">
                  {group.title}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.match || (item.match === "/map" && (pathname === "/" || pathname === "/market"));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    title={sidebarOpen ? undefined : item.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                      "transition-colors duration-[var(--dur-fast)]",
                      !sidebarOpen && "justify-center px-0",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-x-3 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                    )}
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-overshoot)] group-hover:scale-110",
                        active && "text-sidebar-primary",
                      )}
                    />
                    {sidebarOpen && (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate leading-tight">{item.label}</span>
                          <span className="block truncate text-[11px] font-normal text-sidebar-foreground/45">
                            {item.hint}
                          </span>
                        </span>
                        {item.badge && (
                          <span className="rounded-full bg-signal px-2 py-0.5 font-mono text-[11px] font-semibold text-signal-foreground tabular-nums">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              onClick={toggleRail}
              aria-label={sidebarOpen ? "Recolher barra lateral" : "Expandir barra lateral"}
              title="Alternar barra lateral  ["
            >
              {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">Mapa de estado da via</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Concelho de Loulé — Deteções YOLOv11s
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
            title={dark ? "Tema claro" : "Tema escuro"}
            className="overflow-hidden"
          >
            <span
              key={dark ? "sun" : "moon"}
              className="inline-flex motion-safe:animate-in motion-safe:spin-in-90 motion-safe:fade-in motion-safe:duration-200"
            >
              {dark ? <Sun /> : <Moon />}
            </span>
          </Button>
        </header>

        <main className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto p-0">
          <div className="enter-rise h-full w-full">{children}</div>
        </main>
      </div>
    </div>
  );
};

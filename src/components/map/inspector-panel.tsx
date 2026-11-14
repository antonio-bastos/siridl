"use client";

import React from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";

export type InspectorPanelTab = "overview" | "anomalies" | "roads";

const INSPECTOR_PANEL_WIDTH = 420;
const INSPECTOR_PANEL_INSET = 0;
const MIN_WIDTH = 340;
const MAX_WIDTH = 760;
const WIDTH_KEY = "siridl:inspector-panel-width";

const clampWidth = (width: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

export const inspectorPanelCover = (width: number) => width + INSPECTOR_PANEL_INSET;

const inspectorPanelFrame = (width: number) =>
  ({
    className:
      "pointer-events-auto absolute inset-y-0 right-0 z-20 flex h-full w-[min(var(--panel-width),100%)] flex-col overflow-hidden border-l bg-card shadow-xl",
    style: { "--panel-width": `${width}px` } as React.CSSProperties,
  }) as const;

export const useInspectorPanelWidth = () => {
  const [width, setWidth] = React.useState(INSPECTOR_PANEL_WIDTH);
  React.useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(WIDTH_KEY));
      if (stored > 0) setWidth(clampWidth(stored));
    } catch {
      // ignore
    }
  }, []);
  const change = React.useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidth(clamped);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);
  return [width, change] as const;
};

const usePanelResize = (width: number, onWidth: (width: number) => void) => {
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const fromX = e.clientX;
    const widthAt = (ev: PointerEvent) => clampWidth(width + fromX - ev.clientX);
    const move = (ev: PointerEvent) => setDragWidth(widthAt(ev));
    const end = (ev: PointerEvent) => {
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancel);
      setDragWidth(null);
    };
    const up = (ev: PointerEvent) => {
      onWidth(widthAt(ev));
      end(ev);
    };
    const cancel = () => {
      setDragWidth(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", cancel);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") onWidth(width + step);
    else if (e.key === "ArrowRight") onWidth(width - step);
    else if (e.key === "Home") onWidth(INSPECTOR_PANEL_WIDTH);
    else return;
    e.preventDefault();
  };

  const handle = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar painel"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={dragWidth ?? width}
      tabIndex={0}
      title="Arrastar para redimensionar · duplo clique para repor"
      onPointerDown={start}
      onDoubleClick={() => onWidth(INSPECTOR_PANEL_WIDTH)}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 left-0 z-20 hidden w-2 cursor-col-resize touch-none outline-none md:block"
    >
      <div
        className={cn(
          "h-full w-0.5 rounded-full transition-colors group-hover:bg-ring/60 group-focus-visible:bg-ring group-active:bg-ring",
          dragWidth !== null && "bg-ring",
        )}
      />
    </div>
  );

  return { width: dragWidth ?? width, handle };
};

export interface InspectorSheetPick {
  title: string;
  body: React.ReactNode;
  onClose: () => void;
}

export interface InspectorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: InspectorPanelTab;
  onTab: (tab: InspectorPanelTab) => void;
  count: number | null;
  summary: React.ReactNode;
  overview: React.ReactNode;
  overviewLabel?: string;
  anomalies?: React.ReactNode;
  roads?: React.ReactNode;
  actions?: React.ReactNode;
  width: number;
  onWidth: (width: number) => void;
  onFootCover?: (px: number) => void;
  pick?: InspectorSheetPick | null;
  pillTop?: number;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  open,
  onOpenChange,
  tab,
  onTab,
  count,
  summary,
  overview,
  overviewLabel = "Resumo",
  anomalies,
  roads,
  actions,
  width,
  onWidth,
  onFootCover,
  pick,
  pillTop,
}) => {
  const id = React.useId();
  const resize = usePanelResize(width, onWidth);
  const frame = inspectorPanelFrame(resize.width);
  const sheet = useMediaQuery("(max-width: 767.98px)") === true;

  const tabs = React.useMemo(() => {
    const list: { value: InspectorPanelTab; label: string }[] = [
      { value: "overview", label: overviewLabel },
    ];
    if (anomalies) {
      list.push({ value: "anomalies", label: "Anomalias" });
    }
    if (roads) {
      list.push({ value: "roads", label: "Por Via" });
    }
    return list;
  }, [overviewLabel, anomalies, roads]);

  const panes: Record<InspectorPanelTab, React.ReactNode> = {
    overview,
    anomalies: anomalies ?? null,
    roads: roads ?? null,
  };
  const shown = tabs.some((t) => t.value === tab) ? tab : "overview";
  const [built, setBuilt] = React.useState<ReadonlySet<InspectorPanelTab>>(() => new Set([shown]));
  if (!built.has(shown)) setBuilt(new Set(built).add(shown));

  const tablist = (
    <div role="tablist" aria-label="Auditoria municipal" className="flex h-10 flex-1 items-center rounded-lg bg-muted p-[3px]">
      {tabs.map((t) => {
        const active = t.value === shown;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`${id}-${t.value}-tab`}
            aria-selected={active}
            aria-controls={`${id}-${t.value}`}
            onClick={() => onTab(t.value)}
            className={cn(
              "inline-flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:px-1.5 max-sm:text-[13px]",
              active ? "bg-background text-foreground shadow-sm dark:bg-input/30" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.value === "anomalies" && count !== null && (
              <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const tabpanels = tabs.map((t) => (
    <div
      key={t.value}
      role="tabpanel"
      id={`${id}-${t.value}`}
      aria-labelledby={`${id}-${t.value}-tab`}
      hidden={t.value !== shown}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
    >
      {built.has(t.value) && panes[t.value]}
    </div>
  ));

  if (sheet)
    return (
      <InspectorSheet
        open={open}
        onOpenChange={onOpenChange}
        summary={summary}
        tablist={tablist}
        actions={actions}
        onFootCover={onFootCover}
        pick={pick}
      >
        {tabpanels}
      </InspectorSheet>
    );

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          key="panel"
          aria-label="Auditoria municipal"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={frame.className}
          style={frame.style}
        >
          {resize.handle}
          {pick ? (
            <div className="flex h-[57px] shrink-0 items-center gap-1.5 border-b pr-2 pl-4">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{pick.title}</p>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Voltar ao setor"
                title="Voltar ao setor"
                onClick={pick.onClose}
              >
                <X className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Ocultar painel"
                title="Ocultar painel"
                onClick={() => onOpenChange(false)}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 border-b p-2">
              {tablist}
              {actions}
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Ocultar painel"
                title="Ocultar painel"
                onClick={() => onOpenChange(false)}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </div>
          )}
          {pick && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{pick.body}</div>}
          <div className={cn("min-h-0 flex-1 flex-col", pick ? "hidden" : "flex")}>{tabpanels}</div>
        </motion.aside>
      ) : (
        <motion.div
          key="pill"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto absolute top-3 right-3 z-10 max-w-[calc(100%-4.5rem)]"
          style={pillTop === undefined ? undefined : { top: pillTop }}
        >
          <Button
            variant="outline"
            size="sm"
            className="h-10 max-w-full gap-2 rounded-xl border border-border bg-card/95 px-3 text-xs font-medium text-foreground elev-2 backdrop-blur-md transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-muted hover:text-foreground dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100 dark:shadow-black/60 dark:hover:bg-zinc-800"
            onClick={() => onOpenChange(true)}
            title="Mostrar painel"
          >
            <PanelRightOpen className="size-4 shrink-0 text-primary" />
            <span className="sr-only">Mostrar painel:</span>
            <span className="truncate tabular-nums">{summary}</span>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

type SheetStop = "peek" | "half" | "full";
const PEEK_PX = 64;
const HALF_SHARE = 0.5;
const FLICK_SPEED = 0.4;
const TAP_SLOP_PX = 6;
const SHEET_EASE = [0.22, 1, 0.36, 1] as const;

const InspectorSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: React.ReactNode;
  tablist: React.ReactNode;
  actions?: React.ReactNode;
  onFootCover?: (px: number) => void;
  pick?: InspectorSheetPick | null;
  children: React.ReactNode;
}> = ({ open, onOpenChange, summary, tablist, actions, onFootCover, pick, children }) => {
  const ref = React.useRef<HTMLElement>(null);
  const [frameHeight, setFrameHeight] = React.useState(0);
  const [raised, setRaised] = React.useState<"half" | "full">("half");
  const stop: SheetStop = open ? raised : "peek";
  const height = useMotionValue(0);
  const reduced = useReducedMotion();
  const dragging = React.useRef(false);

  React.useLayoutEffect(() => {
    const frame = ref.current?.parentElement;
    if (!frame) return;
    const measure = () => setFrameHeight(frame.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const heightOf = React.useCallback(
    (at: SheetStop) =>
      at === "peek" ? PEEK_PX : at === "half" ? Math.max(PEEK_PX, Math.round(frameHeight * HALF_SHARE)) : frameHeight,
    [frameHeight],
  );

  const glide = React.useCallback(
    (to: number) => void animate(height, to, reduced ? { duration: 0 } : { duration: 0.3, ease: SHEET_EASE }),
    [height, reduced],
  );

  React.useEffect(() => {
    if (frameHeight > 0 && !dragging.current) glide(heightOf(stop));
  }, [stop, frameHeight, heightOf, glide]);

  const onFootCoverRef = React.useRef(onFootCover);
  onFootCoverRef.current = onFootCover;
  const cover = frameHeight > 0 ? heightOf(stop === "full" ? "half" : stop) : 0;
  React.useEffect(() => {
    onFootCoverRef.current?.(cover);
  }, [cover]);
  React.useEffect(() => () => onFootCoverRef.current?.(0), []);

  const settle = (to: SheetStop) => {
    if (to === stop) glide(heightOf(to));
    if (to === "peek") onOpenChange(false);
    else {
      setRaised(to);
      if (!open) onOpenChange(true);
    }
  };
  const up = () => settle(stop === "peek" ? "half" : stop === "half" ? "full" : "half");
  const down = () => settle(stop === "full" ? "half" : "peek");

  const drag = React.useRef<{
    id: number;
    fromY: number;
    fromHeight: number;
    moved: boolean;
    lastY: number;
    lastT: number;
    speed: number;
  } | null>(null);
  const dragged = React.useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      fromY: e.clientY,
      fromHeight: height.get(),
      moved: false,
      lastY: e.clientY,
      lastT: e.timeStamp,
      speed: 0,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientY - d.fromY) < TAP_SLOP_PX) return;
    d.moved = true;
    dragging.current = true;
    height.stop();
    height.set(Math.min(frameHeight, Math.max(PEEK_PX, d.fromHeight + d.fromY - e.clientY)));
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.speed = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) return;
    dragged.current = true;
    const at = height.get();
    const stops = (["peek", "half", "full"] as const).map((s) => ({ s, h: heightOf(s) }));
    const to = cancelled
      ? stop
      : d.speed > FLICK_SPEED
        ? (stops.find((x) => x.h > at + 1)?.s ?? "full")
        : d.speed < -FLICK_SPEED
          ? ([...stops].reverse().find((x) => x.h < at - 1)?.s ?? "peek")
          : stops.reduce((a, b) => (Math.abs(b.h - at) < Math.abs(a.h - at) ? b : a)).s;
    settle(to);
  };
  const grab = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => onPointerEnd(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => onPointerEnd(e, true),
    onClick: () => {
      if (dragged.current) dragged.current = false;
      else up();
    },
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") stop !== "full" && up();
    else if (e.key === "ArrowDown") stop !== "peek" && down();
    else return;
    e.preventDefault();
  };

  return (
    <motion.aside
      ref={ref}
      aria-label="Auditoria municipal"
      style={{ height }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-2xl border-t bg-card elev-3 enter-rise"
    >
      <button
        type="button"
        {...grab}
        onKeyDown={onKeyDown}
        aria-label={stop === "full" ? "Reduzir painel para metade" : "Expandir painel"}
        className="flex h-5 w-full shrink-0 cursor-grab touch-none items-center justify-center outline-none active:cursor-grabbing focus-visible:bg-muted"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-muted-foreground/35" />
      </button>

      {stop === "peek" ? (
        <button
          type="button"
          {...grab}
          onKeyDown={onKeyDown}
          className="flex h-11 w-full shrink-0 touch-none items-center gap-2 px-4 pb-1 text-left text-sm font-medium outline-none focus-visible:bg-muted"
        >
          <ChevronUp className="size-4 shrink-0 text-primary" />
          <span className="sr-only">Mostrar o painel:</span>
          <span className="min-w-0 truncate tabular-nums">{pick ? pick.title : summary}</span>
        </button>
      ) : pick ? (
        <div className="flex h-11 shrink-0 items-center gap-1 border-b pr-2 pb-2 pl-4">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{pick.title}</p>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Voltar ao setor"
            title="Voltar ao setor"
            onClick={pick.onClose}
          >
            <X className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-label={stop === "full" ? "Reduzir painel para metade" : "Minimizar painel"}
            title={stop === "full" ? "Reduzir painel para metade" : "Minimizar painel"}
            onClick={down}
          >
            <ChevronDown className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b px-2 pb-2">
          {tablist}
          {actions}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-label={stop === "full" ? "Reduzir painel para metade" : "Minimizar painel"}
            title={stop === "full" ? "Reduzir painel para metade" : "Minimizar painel"}
            onClick={down}
          >
            <ChevronDown className="size-5" />
          </Button>
        </div>
      )}

      <div inert={stop === "peek"} className="flex min-h-0 flex-1 flex-col">
        {pick && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{pick.body}</div>}
        <div className={cn("min-h-0 flex-1 flex-col", pick ? "hidden" : "flex")}>{children}</div>
      </div>
    </motion.aside>
  );
};

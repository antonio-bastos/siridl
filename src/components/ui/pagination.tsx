"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Watermelon UI "Continuous Pagination" look, sized for a table footer and
 * driven by the design tokens rather than the source's fixed greys. The active
 * page is a raised primary pill; the others are quiet outlined squares. Pages
 * are windowed around the current one so a long list never renders every
 * number.
 */

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Page numbers shown either side of the current one. */
  siblings?: number;
  /** Show the first/last page buttons. */
  showEdges?: boolean;
  className?: string;
};

type Slot = number | "gap-start" | "gap-end";

/** 1 … 4 [5] 6 … 20: the ends always show, the middle follows the current page. */
const buildWindow = (page: number, pageCount: number, siblings: number): Slot[] => {
  // Enough room to show everything, gaps included, means no gaps at all.
  const wide = siblings * 2 + 5;
  if (pageCount <= wide) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, pageCount);
  const slots: Slot[] = [];

  if (left > 1) {
    slots.push(1);
    if (left > 2) slots.push("gap-start");
  }
  for (let p = left; p <= right; p++) slots.push(p);
  if (right < pageCount) {
    if (right < pageCount - 1) slots.push("gap-end");
    slots.push(pageCount);
  }
  return slots;
};

const SQUARE =
  "grid size-8 shrink-0 place-items-center rounded-lg text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-[2px] focus-visible:ring-ring/50";

const QUIET = "border border-border/70 bg-background text-muted-foreground shadow-2xs hover:bg-muted/50 hover:text-foreground";

const NAV = cn(SQUARE, QUIET, "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none");

const ACTIVE_CLASS = "border border-primary/30 bg-primary text-primary-foreground font-semibold shadow-xs";

export function Pagination({ page, pageCount, onPageChange, siblings = 1, showEdges = true, className }: PaginationProps) {
  const pages = Math.max(pageCount, 1);
  const current = Math.min(Math.max(page, 1), pages);

  const go = (next: number) => {
    if (next < 1 || next > pages || next === current) return;
    onPageChange(next);
  };

  const slots = buildWindow(current, pages, siblings);

  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1.5", className)}>
      {showEdges && (
        <button type="button" onClick={() => go(1)} disabled={current <= 1} aria-label="First page" className={NAV}>
          <ChevronsLeft className="size-4" />
        </button>
      )}
      <button type="button" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous page" className={NAV}>
        <ChevronLeft className="size-4" />
      </button>

      {slots.map((slot) => {
        if (typeof slot !== "number") {
          return (
            <span key={slot} aria-hidden className="grid size-8 place-items-center text-xs text-muted-foreground/70 select-none">
              …
            </span>
          );
        }
        const isActive = slot === current;
        return (
          <button
            key={slot}
            type="button"
            onClick={() => go(slot)}
            aria-label={`Page ${slot}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(SQUARE, isActive ? ACTIVE_CLASS : QUIET)}
          >
            {slot}
          </button>
        );
      })}


      <button type="button" onClick={() => go(current + 1)} disabled={current >= pages} aria-label="Next page" className={NAV}>
        <ChevronRight className="size-4" />
      </button>
      {showEdges && (
        <button type="button" onClick={() => go(pages)} disabled={current >= pages} aria-label="Last page" className={NAV}>
          <ChevronsRight className="size-4" />
        </button>
      )}
    </nav>
  );
}

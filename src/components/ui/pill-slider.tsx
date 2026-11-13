"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A slider drawn as a rounded track that fills up to a round thumb, both
 * springing to the value, with the figure beside it rolling a character at a
 * time. After Watermelon's Adaptive Slider, made toolbar-sized, controlled and
 * one colour (the primary blue, which is also the map's selection circle).
 *
 * Underneath is a native range input, invisible and over the whole track, so
 * the keyboard, touch and screen readers get the browser's own slider.
 *
 * Two callbacks, because a drag passes through many values the caller may
 * not want to act on: `onScrub` follows the drag (and is called with null
 * when it ends), `onChange` gets the value once, when the pointer lets go or
 * a key is pressed. A caller that re-queries on change previews on scrub.
 */

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;
/** The thumb's box, the track's height: the fill and the thumb travel the track's width less this. */
const THUMB = 32;

/** Each character that changes slides in from below as the value grows and from above as it shrinks. */
const RollingText: React.FC<{ text: string; direction: number }> = ({ text, direction }) => (
  <span className="inline-flex overflow-hidden">
    <AnimatePresence mode="popLayout" initial={false}>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          initial={{ y: direction * 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: direction * -10, opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </AnimatePresence>
  </span>
);

export interface PillSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onScrub?: (value: number | null) => void;
  format?: (value: number) => string;
  /** Values marked with a dot along the track, as landmarks. */
  major?: (value: number) => boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export const PillSlider: React.FC<PillSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  onScrub,
  format = String,
  major,
  disabled,
  className,
  "aria-label": ariaLabel,
}) => {
  const [scrub, setScrub] = React.useState<number | null>(null);
  const dragging = React.useRef(false);
  const scrubbed = React.useRef<number | null>(null);
  const shown = scrub ?? value;
  const fraction = Math.min(1, Math.max(0, (shown - min) / (max - min)));

  const last = React.useRef(shown);
  const direction = shown >= last.current ? 1 : -1;
  React.useEffect(() => {
    last.current = shown;
  }, [shown]);

  const landmarks = React.useMemo(() => {
    if (!major) return [];
    const marks: number[] = [];
    for (let at = min; at <= max; at += step) if (major(at)) marks.push((at - min) / (max - min));
    return marks;
  }, [major, min, max, step]);

  // Read through a ref: the drag ends in a window listener, which a render later would otherwise see stale.
  const latest = React.useRef({ value, onChange, onScrub });
  latest.current = { value, onChange, onScrub };
  const finish = (commit: boolean) => {
    if (!dragging.current) return;
    dragging.current = false;
    const next = scrubbed.current;
    scrubbed.current = null;
    if (commit && next !== null && next !== latest.current.value) latest.current.onChange(next);
    setScrub(null);
    latest.current.onScrub?.(null);
  };

  return (
    <div className={cn("flex items-center gap-2 select-none", disabled && "opacity-50", className)}>
      <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-full bg-muted has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50 dark:bg-input/50">
        {/* A dot for each landmark, sitting where the thumb's centre would be at that value. */}
        {landmarks.map((f) => (
          <span
            key={f}
            aria-hidden
            className="absolute top-1/2 size-1 -translate-1/2 rounded-full bg-muted-foreground/40"
            style={{ left: `calc(${f} * (100% - ${THUMB}px) + ${THUMB / 2}px)` }}
          />
        ))}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={false}
          animate={{ width: `calc(${fraction} * (100% - ${THUMB}px) + ${THUMB}px)` }}
          transition={SPRING}
        />
        <motion.div
          aria-hidden
          className="absolute top-0 flex items-center justify-center"
          style={{ width: THUMB, height: THUMB }}
          initial={false}
          animate={{ left: `calc(${fraction} * (100% - ${THUMB}px))` }}
          transition={SPRING}
        >
          <motion.span
            className="size-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
            animate={{ scale: scrub !== null ? 0.85 : 1 }}
            transition={SPRING}
          />
        </motion.div>
        <input
          type="range"
          aria-label={ariaLabel}
          aria-valuetext={format(shown)}
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={disabled}
          onPointerDown={() => {
            dragging.current = true;
            // On the window, since a drag can end off the track.
            const up = (event: PointerEvent) => {
              window.removeEventListener("pointerup", up);
              window.removeEventListener("pointercancel", up);
              finish(event.type === "pointerup");
            };
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
          }}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (dragging.current) {
              scrubbed.current = next;
              setScrub(next);
              onScrub?.(next);
            } else if (next !== value) {
              onChange(next);
            }
          }}
          // The browser's thumb made as wide as the drawn one, so the value under the pointer is the one the thumb shows.
          className={cn(
            "absolute inset-0 h-full w-full cursor-pointer touch-none appearance-none bg-transparent opacity-0 disabled:cursor-default",
            "[&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:border-0",
          )}
        />
      </div>
      <span aria-hidden className="flex w-12 shrink-0 justify-end text-xs font-medium tabular-nums">
        <RollingText text={format(shown)} direction={direction} />
      </span>
    </div>
  );
};

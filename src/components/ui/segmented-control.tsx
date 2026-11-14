"use client";

import React, { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption = {
  value: string;
  label: string;
  activeClassName?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
};

export const SegmentedControl: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: readonly SegmentOption[];
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}> = ({ id, value, onChange, onBlur, options, disabled, className, labelClassName }) => {
  const index = options.findIndex((option) => option.value === value);
  const active = index >= 0 ? options[index] : undefined;
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    const measure = () => {
      const chosen = buttons.current[index];
      setBox(chosen ? { left: chosen.offsetLeft, width: chosen.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const button of buttons.current) if (button) observer.observe(button);
    return () => observer.disconnect();
  }, [index, options.length]);

  return (
    <div id={id} role="group" className={cn("relative flex h-9 w-full items-stretch gap-1 rounded-md border bg-background p-[3px] dark:bg-input/30", className)}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-[3px] left-[3px] rounded-sm border transition-[transform,width,opacity,background-color,border-color] duration-200 ease-out motion-reduce:transition-none",
          active ? (active.activeClassName ?? "border-transparent bg-muted shadow-xs") : "opacity-0",
        )}
        style={
          box
            ? { width: box.width, transform: `translateX(${box.left - 3}px)` }
            : { width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${Math.max(index, 0) * 100}%)` }
        }
      />
      {options.map((option, i) => {
        const chosen = i === index;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            type="button"
            aria-pressed={chosen}
            disabled={disabled}
            onBlur={onBlur}
            onClick={() => {
              if (!chosen) onChange(option.value);
            }}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
              i > 0 && "before:absolute before:inset-y-1.5 before:-left-0.5 before:w-px before:bg-border before:transition-opacity before:duration-200",
              (chosen || i === index + 1) && "before:opacity-0",
              !chosen && "hover:bg-accent/70",
              chosen ? cn(option.activeClassName, "border-0 bg-transparent shadow-none dark:bg-transparent") : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon}
            {labelClassName ? <span className={labelClassName}>{option.label}</span> : option.label}
            {option.badge}
          </button>
        );
      })}
    </div>
  );
};

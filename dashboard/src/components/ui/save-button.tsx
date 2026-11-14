"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

/** The blurs on a tween of their own: the springs overshoot, and a blur past 0 is negative, which the browser rejects. */
const BLUR_TWEEN = { duration: 0.2, ease: "easeOut" } as const;

export type SaveButtonStatus = "idle" | "loading" | "success";

export type SaveButtonProps = Omit<React.ComponentProps<typeof Button>, "size"> & {
  size?: "sm" | "default" | "lg" | "icon" | "icon-sm";
  status?: SaveButtonStatus;
  loading?: boolean;
  idleText?: string;
  loadingText?: string;
  successText?: string;
  hideText?: boolean;
  showIcon?: boolean;
  icon?: React.ReactNode;
  onStatusChange?: (status: SaveButtonStatus) => void;
};

export function SaveButton({
  className,
  variant = "default",
  size = "default",
  status: controlledStatus,
  loading,
  idleText,
  loadingText = "Saving",
  successText = "Saved",
  hideText = false,
  showIcon = true,
  icon,
  disabled,
  children,
  onClick,
  onStatusChange,
  ...props
}: SaveButtonProps) {
  const [internalStatus, setInternalStatus] = useState<SaveButtonStatus>("idle");
  const prevLoadingRef = useRef(loading);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with controlled status if provided
  const status = controlledStatus ?? internalStatus;

  // Notify when status changes
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Handle controlled `loading` prop (e.g. from Refine / TanStack Query)
  useEffect(() => {
    if (controlledStatus !== undefined) return;

    if (loading) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setInternalStatus("loading");
    } else if (prevLoadingRef.current && !loading) {
      setInternalStatus("success");
      resetTimerRef.current = setTimeout(() => {
        setInternalStatus("idle");
      }, 2000);
    }

    prevLoadingRef.current = loading;

    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [loading, controlledStatus]);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || status !== "idle") return;

    // Call external onClick
    let result: unknown = undefined;
    if (onClick) {
      result = (onClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(e);
    }

    // If controlled status or controlled loading is active, let them drive the state
    if (controlledStatus !== undefined || typeof loading === "boolean") {
      return;
    }

    // If onClick returned a Promise, await it
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setInternalStatus("loading");
      try {
        await (result as Promise<unknown>);
        setInternalStatus("success");
        resetTimerRef.current = setTimeout(() => {
          setInternalStatus("idle");
        }, 2000);
      } catch {
        setInternalStatus("idle");
      }
      return;
    }

    // Default standalone demo simulation if no loading prop and no promise
    setInternalStatus("loading");
    resetTimerRef.current = setTimeout(() => {
      setInternalStatus("success");
      resetTimerRef.current = setTimeout(() => {
        setInternalStatus("idle");
      }, 2000);
    }, 1500);
  };

  const defaultIdle = typeof children === "string" ? children : "Save";
  const text = useMemo(() => {
    switch (status) {
      case "idle":
        return idleText ?? defaultIdle;
      case "loading":
        return loadingText;
      case "success":
        return successText;
    }
  }, [status, idleText, defaultIdle, loadingText, successText]);

  // Dimensions & sizes
  const sizeClasses = useMemo(() => {
    switch (size) {
      case "sm":
        return {
          btn: "h-8 px-3.5 text-sm min-w-[88px] gap-1.5",
          pip: "size-4 -top-1 -right-1 ring-2",
          pipIcon: "size-2.5",
          buttonIcon: "size-4",
        };
      case "lg":
        return {
          btn: "h-12 px-8 text-base min-w-[140px] gap-2",
          pip: "size-6 -top-1 -right-1 ring-3",
          pipIcon: "size-4",
          buttonIcon: "size-5",
        };
      case "default":
      default:
        return {
          btn: "h-9 px-4 text-sm min-w-[102px] gap-1.5",
          pip: "size-5 -top-1 -right-1 ring-2",
          pipIcon: "size-3",
          buttonIcon: "size-4",
        };
    }
  }, [size]);

  return (
    <div className="relative inline-flex group">
      <Button
        {...props}
        size={size}
        variant={variant}
        onClick={handleClick}
        className={cn(
          "relative font-medium transition-all duration-300 disabled:opacity-100",
          sizeClasses.btn,
          status === "idle"
            ? "transition-colors"
            : "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed border-muted shadow-sm",
          className
        )}
        disabled={disabled || status !== "idle"}
      >
        <span className="inline-flex items-center justify-center gap-1.5">
          {showIcon && !hideText && (
            <span className="shrink-0 inline-flex items-center justify-center">
              {status === "success" ? (
                <Check className={sizeClasses.buttonIcon} />
              ) : (
                (icon ?? <Save className={sizeClasses.buttonIcon} />)
              )}
            </span>
          )}
          {!hideText ? (
            <span className="inline-flex items-center">
              <AnimatePresence mode="popLayout" initial={false}>
                {text.split("").map((char, i) => (
                  <motion.span
                    key={`${char}-${i}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                      mass: 1,
                      filter: BLUR_TWEEN,
                    }}
                    className="inline-block"
                  >
                    {char === " " ? "\u00A0" : char}
                  </motion.span>
                ))}
              </AnimatePresence>
            </span>
          ) : (
            (icon ?? <Save className={sizeClasses.buttonIcon} />)
          )}
        </span>
      </Button>

      {/* Status Indicator */}
      <div className="absolute -top-1 -right-1 z-10 pointer-events-none">
        <AnimatePresence mode="wait">
          {status !== "idle" && (
            <motion.div
              initial={{ opacity: 0, scale: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0, x: -8, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 300, damping: 20, filter: BLUR_TWEEN }}
              className={cn(
                "flex items-center justify-center rounded-full overflow-visible ring-background",
                sizeClasses.pip,
                status === "success"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <AnimatePresence mode="popLayout">
                {status === "loading" && (
                  <motion.div
                    key="loader"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className={sizeClasses.pipIcon}
                    >
                      <path
                        fill="currentColor"
                        d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z"
                        opacity=".5"
                      />
                      <path
                        fill="currentColor"
                        d="M20 12h2A10 10 0 0 0 12 2V4A8 8 0 0 1 20 12Z"
                      >
                        <animateTransform
                          attributeName="transform"
                          dur="1s"
                          from="0 12 12"
                          repeatCount="indefinite"
                          to="360 12 12"
                          type="rotate"
                        />
                      </path>
                    </svg>
                  </motion.div>
                )}
                {status === "success" && (
                  <motion.div
                    key="check"
                    initial={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 25, filter: BLUR_TWEEN }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={sizeClasses.pipIcon}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

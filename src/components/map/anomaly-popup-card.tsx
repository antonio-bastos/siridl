"use client";

import React from "react";
import { ImageOff, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
import type { YoloBoundingBox } from "@/models/road-anomalies";

export type PopupCardBadgeTone = "neutral" | "good" | "warning" | "serious" | "critical";

const REUI_VARIANT_BY_TONE: Record<
  PopupCardBadgeTone,
  "invert" | "success" | "warning" | "destructive" | "info"
> = {
  neutral: "invert",
  good: "success",
  warning: "warning",
  serious: "destructive",
  critical: "destructive",
};

export const PopupCardBadge: React.FC<{ color?: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase shadow-sm"
    style={{ backgroundColor: color ?? "var(--primary)" }}
  >
    {children}
  </span>
);

export const PopupCardAction: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({
  children,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-primary/90 motion-safe:active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
  >
    {children}
  </button>
);

export interface AnomalyPopupCardProps {
  photo?: string;
  placeholder?: "radar" | "photo";
  badge?: React.ReactNode | { label: string; tone?: PopupCardBadgeTone; dot?: string };
  reference?: string;
  referenceClassName?: string;
  title: string;
  location?: string;
  place?: string;
  coverage?: string;
  aside?: React.ReactNode;
  specs?: string[];
  facts?: string | string[];
  note?: string;
  action?: React.ReactNode | { label: string; onClick: () => void };
  detections?: YoloBoundingBox[];
  imageWidth?: number;
  imageHeight?: number;
  confidence?: number;
  className?: string;
}

export const AnomalyPopupCard: React.FC<AnomalyPopupCardProps> = ({
  photo,
  placeholder = "photo",
  badge,
  reference,
  referenceClassName,
  title,
  location,
  place,
  coverage,
  aside,
  specs,
  facts,
  note,
  action,
  detections,
  imageWidth = 1280,
  imageHeight = 720,
  confidence,
  className,
}) => {
  const [failed, setFailed] = React.useState(false);
  const [showBoxes, setShowBoxes] = React.useState(true);
  const src = photo && !failed ? photo : undefined;
  const PlaceholderIcon = placeholder === "radar" ? Radar : ImageOff;
  const displayLocation = place || location;
  const displayFacts = facts
    ? Array.isArray(facts)
      ? facts.join(" · ")
      : facts
    : specs
      ? specs.join(" · ")
      : null;

  return (
    <div className={cn("w-64 overflow-hidden text-left font-sans text-popover-foreground", className)}>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {src ? (
          <>
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className="h-full w-full object-cover"
            />
            {showBoxes && detections && detections.length > 0 && (
              <svg
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                preserveAspectRatio="xMidYMid slice"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {detections.map((box, idx) => (
                  <g key={idx}>
                    <rect
                      x={box.x1}
                      y={box.y1}
                      width={box.width}
                      height={box.height}
                      fill="rgba(239, 68, 68, 0.18)"
                      stroke="#ff3b30"
                      strokeWidth={9}
                      rx={8}
                    />
                    <rect
                      x={box.x1}
                      y={Math.max(12, box.y1 - 46)}
                      width={260}
                      height={42}
                      rx={6}
                      fill="#ff3b30"
                    />
                    <text
                      x={box.x1 + 12}
                      y={Math.max(41, box.y1 - 17)}
                      fill="#ffffff"
                      fontSize={26}
                      fontWeight={700}
                      fontFamily="monospace"
                    >
                      {`buraco ${(box.confidence * 100).toFixed(0)}%`}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground/45">
            <PlaceholderIcon className="size-7" strokeWidth={1.5} aria-hidden />
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/45 to-transparent"
        />
        {(badge || (detections && detections.length > 0)) && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5">
            {badge && (
              <span>
                {React.isValidElement(badge) ? (
                  badge
                ) : typeof badge === "object" && "label" in badge ? (
                  <Badge
                    variant={REUI_VARIANT_BY_TONE[(badge as { tone?: PopupCardBadgeTone }).tone ?? "neutral"]}
                    size="sm"
                    className="elev-1 backdrop-blur-xs"
                  >
                    {(badge as { dot?: string }).dot && (
                      <span aria-hidden className="size-1.5 rounded-full bg-white" />
                    )}
                    {(badge as { label: string }).label}
                  </Badge>
                ) : null}
              </span>
            )}
            {detections && detections.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBoxes((v) => !v);
                }}
                className="cursor-pointer rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-xs transition-colors hover:bg-black/90"
                title="Alternar caixas delimitadoras YOLOv11"
              >
                {showBoxes
                  ? `YOLO ${(confidence ? confidence * 100 : detections[0].confidence * 100).toFixed(0)}%`
                  : "IMAGEM"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center gap-1.5">
          {reference && (
            <Badge
              variant="outline"
              size="xs"
              className={cn("font-mono tracking-wide uppercase", referenceClassName)}
            >
              {reference}
            </Badge>
          )}
          <p className="min-w-0 flex-1 truncate text-xs leading-snug font-semibold">{title}</p>
        </div>
        {displayLocation && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{displayLocation}</p>}

        {(coverage || aside) && (
          <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-border/60 pt-2">
            {coverage ? <span className="text-sm font-bold tracking-tight tabular-nums">{coverage}</span> : <span />}
            {aside && <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{aside}</span>}
          </div>
        )}

        {displayFacts && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground tabular-nums">{displayFacts}</p>
        )}

        {note && <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{note}</p>}

        {action &&
          (React.isValidElement(action) ? (
            action
          ) : typeof action === "object" && "label" in action ? (
            <button
              type="button"
              onClick={(action as { onClick: () => void }).onClick}
              className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-primary/90 motion-safe:active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {(action as { label: string }).label}
            </button>
          ) : null)}
      </div>
    </div>
  );
};

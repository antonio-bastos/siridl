"use client";

import * as React from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Whether a drag carries files from outside the page, as opposed to something
 * on the page being dragged — a photo being reordered, a selected word.
 */
export const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

export interface DropzoneProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDrop" | "title"> {
  /** The picked or dropped files. Never called with an empty list. */
  onFiles: (files: File[]) => void;
  /** Passed straight through to the file input. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /**
   * An upload is in flight. The surface stays where it is but stops taking
   * files, and the icon becomes a spinner so the wait is visible without a
   * separate status line.
   */
  busy?: boolean;
  /** Headline when nothing is being dragged. */
  title?: React.ReactNode;
  /** Headline while files are held over the surface. */
  dragTitle?: React.ReactNode;
  /** Accepted formats, size limits, whatever the user needs to know before picking. */
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /**
   * `md` is the card-sized surface; `lg` fills an empty pane; `sm` is a single
   * row for sitting under a list that is already populated.
   */
  size?: "sm" | "md" | "lg";
  /**
   * Drag state driven from outside — a parent that also accepts drops can light
   * the surface up while files are anywhere over it, not only over this box.
   */
  active?: boolean;
  /** Rendered after the text: a button, a note. */
  children?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Drag-and-drop file surface, after Watermelon's `file-upload-1` block.
 *
 * Owns the file input and the drag bookkeeping. A `<div role="button">` rather
 * than a `<button>`, so a real button can sit inside it. Dragging a photo to
 * reorder it crosses this surface without lighting it up: only drags that carry
 * files count.
 */
export const Dropzone = React.forwardRef<HTMLDivElement, DropzoneProps>(
  (
    {
      onFiles,
      accept,
      multiple = false,
      disabled = false,
      busy = false,
      title = "Drag & drop or click to browse",
      dragTitle = "Release to add files",
      description,
      icon,
      size = "md",
      active = false,
      children,
      inputRef,
      className,
      onClick,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const ownInputRef = React.useRef<HTMLInputElement>(null);
    // Enter/leave fire for every child crossed; the count says when the pointer
    // has really left the surface.
    const depth = React.useRef(0);
    const [dragging, setDragging] = React.useState(false);

    const inert = disabled || busy;
    const lit = !inert && (dragging || active);

    const setInput = (node: HTMLInputElement | null) => {
      ownInputRef.current = node;
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    const browse = () => {
      if (!inert) ownInputRef.current?.click();
    };

    const take = (list: FileList | null) => {
      const files = Array.from(list ?? []);
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={inert ? -1 : 0}
        aria-disabled={inert || undefined}
        data-dragging={lit || undefined}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          // A button inside the surface handles its own click.
          if ((e.target as HTMLElement).closest("button, a")) return;
          browse();
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            browse();
          }
        }}
        onDragEnter={(e) => {
          if (inert || !dragHasFiles(e)) return;
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!dragHasFiles(e)) return;
          // Prevented either way: an unhandled file drop navigates the tab to the file.
          e.preventDefault();
          e.dataTransfer.dropEffect = inert ? "none" : "copy";
        }}
        onDragLeave={(e) => {
          if (!dragHasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!dragHasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          if (!inert) take(e.dataTransfer.files);
        }}
        className={cn(
          "group/dropzone relative flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          size === "sm" && "flex-row gap-4 px-4 py-3 text-left",
          size === "md" && "flex-col gap-3 py-8 text-center",
          size === "lg" && "flex-col gap-4 py-14 text-center",
          lit ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/50 hover:bg-muted/60",
          inert && "cursor-default hover:border-border hover:bg-muted/40",
          disabled && "opacity-60",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border transition-colors duration-200 [&>svg]:shrink-0",
            size === "sm" && "size-10 [&>svg]:size-4",
            size === "md" && "size-11 [&>svg]:size-5",
            size === "lg" && "size-14 [&>svg]:size-6",
            lit ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground",
          )}
        >
          {busy ? <Loader2 className="animate-spin" /> : (icon ?? <CloudUpload />)}
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-col gap-1",
            size === "sm" ? "flex-1 items-start" : "items-center",
          )}
        >
          <p className={cn("font-medium text-foreground", size === "lg" ? "text-base" : "text-sm")}>
            {lit ? dragTitle : title}
          </p>
          {description && (
            <p className={cn("text-muted-foreground", size === "lg" ? "text-sm" : "text-xs")}>{description}</p>
          )}
        </div>

        {children}

        <input
          ref={setInput}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          disabled={inert}
          tabIndex={-1}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    );
  },
);
Dropzone.displayName = "Dropzone";

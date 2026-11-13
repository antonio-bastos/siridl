"use client";

import React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export const Toaster: React.FC<ToasterProps> = (props) => {
  return (
    <Sonner
      position="top-right"
      closeButton
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: { borderRadius: "16px" },
        classNames: {
          toast: "shadow-xl",
          success: "toast-success shadow-emerald-500/5",
          error: "toast-error shadow-destructive/5",
          warning: "toast-warning shadow-amber-500/5",
          info: "toast-info shadow-sky-500/5",
          loading: "toast-loading shadow-2xl shadow-indigo-500/5",
        },
      }}
      {...props}
    />
  );
};

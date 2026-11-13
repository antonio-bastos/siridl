import type { Metadata } from "next";
import React, { Suspense } from "react";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "./globals.css";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "SIRI-DL · Mapeamento Geoespacial de Buracos",
  description: "Deteção de Anomalias Rodoviárias YOLOv11s & Painel SIG de Manutenção Municipal",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('siridl:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}" }} /></head>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased overflow-x-clip">
        <Suspense>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="bottom-right" />
        </Suspense>
      </body>
    </html>
  );
}

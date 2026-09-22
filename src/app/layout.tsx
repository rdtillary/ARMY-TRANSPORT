import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCTE — AI Transport & Road Space Management",
  description:
    "AI based transport and road space management system for the Military College of Telecommunication Engineering (MCTE) — officer command, JCO monitoring and driver GPS tracking terminals.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Army Transport CMS",
  },
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a2215",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
              window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function () {});
              });
            }
          `,
        }}
      />
    </html>
  );
}

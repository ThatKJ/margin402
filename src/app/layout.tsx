import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { JobProvider } from "@/lib/state/job-context";
import { WalletProvider } from "@/lib/wallet/WalletContext";
import { SiteNav } from "@/components/layout/SiteNav";
import { isDemoMode } from "@/lib/providers/generate";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans-loaded", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Margin402 — Fixed price. Verified outcome.",
    template: "%s · Margin402",
  },
  description:
    "Fixed-price, outcome-guaranteed AI execution for autonomous agents. Margin402 doesn't guarantee profit. It guarantees the outcome.",
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-panel-3 focus:px-sm focus:py-xs focus:text-body-sm focus:text-ink"
        >
          Skip to content
        </a>
        <WalletProvider>
          <JobProvider>
            <SiteNav replayMode={isDemoMode()} />
            <main id="main">{children}</main>
          </JobProvider>
        </WalletProvider>
      </body>
    </html>
  );
}

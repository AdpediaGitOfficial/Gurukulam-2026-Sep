import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two faces, wired as CSS variables that `globals.css` reads through
 * `--font-sans` and `--font-mono`.
 *
 * JetBrains Mono is not decorative: identifiers — record codes, ISO codes,
 * timezones — are read character by character and copied, and a proportional
 * face makes `STU-2026-0891` and `STU-2026-O891` look alike.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // A template so a page sets only its own name and still shows the product's.
  title: { default: "Gurukulam TMS", template: "%s · Gurukulam TMS" },
  description: "Training management for retail and B2B college engagements.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

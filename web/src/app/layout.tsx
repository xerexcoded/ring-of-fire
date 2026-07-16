import type { Metadata, Viewport } from "next";
import { Geist, Newsreader } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Restless Pacific — Interactive Ring of Fire Atlas",
    template: "%s · Restless Pacific",
  },
  description:
    "A sourced, interactive atlas of volcanoes, earthquakes, plate boundaries, and tsunamis around the Pacific.",
  icons: { icon: "/restless-pacific-mark.svg" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Restless Pacific",
    description: "A ring that isn’t a ring — an interactive Pacific geology atlas.",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#05080a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${newsreader.variable}`} data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

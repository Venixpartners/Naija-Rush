import "@fontsource-variable/bricolage-grotesque/index.css";
import "@fontsource-variable/dm-sans/index.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: "Naija Rush: Survive Lagos", template: "%s · Naija Rush" },
  description: "A free 3D runner through Lagos traffic. Survive sixty seconds, send the link, dare your friends to beat it.",
  applicationName: "Naija Rush",
  openGraph: { siteName: "Naija Rush", type: "website", locale: "en_NG" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1B0B3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

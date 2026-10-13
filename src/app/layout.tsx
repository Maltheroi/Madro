import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Madro – madplan, makroer og indkøb", template: "%s · Madro" },
  description:
    "Sæt dine ernæringsmål og dit madbudget. Få en personlig ugeplan, den bedste enkelte butik til din kurv og en indkøbsliste med gennemsigtige priser.",
  applicationName: "Madro",
  appleWebApp: { capable: true, title: "Madro", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1c2422" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page renders per request so Next.js can apply the CSP nonce from src/proxy.ts.
  await connection();
  return (
    <html lang="da">
      <body>
        <a
          href="#indhold"
          className="focus:bg-card sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
        >
          Spring til indhold
        </a>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

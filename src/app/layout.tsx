import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Madro – madplan, makroer og indkøb", template: "%s · Madro" },
  description:
    "Sæt dine ernæringsmål og dit madbudget. Få en personlig ugeplan, den bedste enkelte butik til din kurv og en indkøbsliste med gennemsigtige priser.",
  applicationName: "Madro",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1c2422" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
      </body>
    </html>
  );
}

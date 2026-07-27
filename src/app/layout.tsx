import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/site";
import { themeScript } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
  // What a shared link looks like in Messages, iMessage and Slack. Without
  // these the preview falls back to a bare URL, which reads as spam.
  openGraph: {
    title: SITE.name,
    description: SITE.description,
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Applies the stored theme before the first paint. It has to be inline
          and synchronous: anything deferred renders the default theme and then
          flips to the chosen one, which is the flash this exists to avoid.
          `suppressHydrationWarning` above is because this script writes to the
          root element before React sees it.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

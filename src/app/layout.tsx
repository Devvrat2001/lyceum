import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Fraunces } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/react";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { env } from "@/lib/env";

const interTight = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves relative OG/canonical URLs on every page (R32). Without it,
  // per-page openGraph images/urls don't get absolutized for crawlers.
  metadataBase: new URL(env.PUBLIC_BASE_URL),
  applicationName: "Lyceum",
  title: {
    default: "Lyceum — Personalized learning, with an AI tutor on every page",
    // Child pages set just their title; the template appends the brand.
    template: "%s · Lyceum",
  },
  description:
    "Lyceum is a personalized K-12 learning platform with adaptive paths, AI tutors that cite the textbook, gamified XP & streaks, and a creator marketplace for teachers.",
  openGraph: {
    siteName: "Lyceum",
    type: "website",
    title: "Lyceum — Personalized K-12 learning with an AI tutor",
    description:
      "Adaptive paths, AI tutors that cite the textbook, gamified XP & streaks, and a marketplace of teacher-built courses.",
  },
  twitter: { card: "summary_large_image" },
  // Lets iOS add Lyceum to the home screen as a standalone app. The web
  // manifest (app/manifest.ts) drives installability everywhere else.
  appleWebApp: {
    capable: true,
    title: "Lyceum",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f1d1a",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${interTight.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider>
          <TRPCProvider>
            {children}
            {/* Global ⌘K palette — needs the tRPC provider for search. */}
            <CommandPalette />
          </TRPCProvider>
        </NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

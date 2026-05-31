import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/react";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

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
  applicationName: "Lyceum",
  title: "Lyceum — Personalized learning, with an AI tutor on every page",
  description:
    "Lyceum is a personalized K-12 learning platform with adaptive paths, AI tutors that cite the textbook, gamified XP & streaks, and a creator marketplace for teachers.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TRPCProvider>{children}</TRPCProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

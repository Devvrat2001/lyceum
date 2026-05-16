import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/react";

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
  title: "Lyceum — Personalized learning, with an AI tutor on every page",
  description:
    "Lyceum is a personalized K-12 learning platform with adaptive paths, AI tutors that cite the textbook, gamified XP & streaks, and a creator marketplace for teachers.",
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
      </body>
    </html>
  );
}

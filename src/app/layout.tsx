import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./twilio-fonts.css";
import "./globals.css";

// Inter stays as the fallback behind Twilio Sans (see twilio-fonts.css).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Twilio Cafe",
  description: "Get a free beverage on Twilio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <link rel="shortcut icon" href="/favicon.ico" />
      <body className={inter.variable}>{children}</body>
    </html>
  );
}

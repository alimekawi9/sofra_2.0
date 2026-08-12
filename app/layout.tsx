import type { Metadata } from "next";
import { sv2Display, sv2Sans } from "@/components/sofra-v2/fonts";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./sofra.css";
import "./production-shell.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Sofra",
  description: "Private dining, beautifully hosted.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sv2Display.variable} ${sv2Sans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

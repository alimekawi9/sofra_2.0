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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('sofra_theme')==='dark'?'dark':'light'}catch(e){}" }} />
      </head>
      <body
        className={`${sv2Display.variable} ${sv2Sans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

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
  icons: {
    icon: "/sofra-logo.jpeg",
    apple: "/sofra-logo.jpeg",
  },
  openGraph: {
    title: "Sofra",
    description: "Private dining, beautifully hosted.",
    images: [{ url: "/sofra-logo.jpeg", width: 960, height: 1280, alt: "Sofra" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sofra",
    description: "Private dining, beautifully hosted.",
    images: ["/sofra-logo.jpeg"],
  },
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

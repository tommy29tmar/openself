import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Figtree,
  Cormorant_Garamond,
  Lato,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

// Signal voice — plus jakarta sans (heading) + figtree (body)
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-figtree",
  display: "swap",
});

// Narrative voice — cormorant garamond (heading) + lato (body)
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-lato",
  display: "swap",
});

// Terminal voice — jetbrains mono (heading + body)
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenSelf",
  description: "Talk for 5 minutes. Get a living personal page.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${figtree.variable} ${cormorant.variable} ${lato.variable} ${jetbrainsMono.variable}`}
    >
      <body className={plusJakarta.className}>{children}</body>
    </html>
  );
}

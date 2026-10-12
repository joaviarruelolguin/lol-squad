import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_TITLE, APP_DESCRIPTION, APP_REPO_URL } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * URL pública del sitio.
 *
 * Es lo que hace que la imagen de preview funcione cuando comparten el link:
 * si queda apuntando a localhost, WhatsApp no puede bajarla y el link sale
 * pelado. En Vercel la detectamos solos; en local caemos a localhost.
 */
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  // Vercel inyecta VERCEL_PROJECT_PRODUCTION_URL (producción) o VERCEL_URL (preview).
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL("http://localhost:3000");
}

/**
 * Metadatos de la preview del link.
 *
 * Es lo que ven tus amigos cuando les mandás la URL por WhatsApp: sin esto
 * los bots muestran un link pelado, sin título ni imagen. La imagen la genera
 * `opengraph-image.tsx` y Next la sirve sola en /opengraph-image.
 */
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: APP_TITLE,
    template: `%s · ${APP_TITLE}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_TITLE,
  keywords: [
    "League of Legends",
    "LoL",
    "flex",
    "ranked",
    "estadísticas",
    "sinergia",
    "duos",
    "tríos",
    "partidas",
    "dashboard",
    "squad",
  ],
  openGraph: {
    type: "website",
    siteName: APP_TITLE,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  other: {
    "github-url": APP_REPO_URL,
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

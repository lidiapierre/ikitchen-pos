import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import { UserProvider } from "@/lib/user-context";
import OfflineIndicator from "@/components/OfflineIndicator";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-noto-sans",
  subsets: ["latin", "bengali"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Lahore by iKitchen",
  description: "Restaurant POS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansBengali.variable} antialiased`}
      >
        <UserProvider>
          <AppHeader />
          {children}
        </UserProvider>
        <OfflineIndicator />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

import { auth } from "@/app/Login/types/auth"; // 👈 IMPORTANTE: Importa tu función auth de NextAuth v5
import type { Metadata } from "next";
import { Geist,Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import SessionWrapper from "./componets/session";
import { DbProvider } from "./componets/tables_recharge";
import { IdleMonitor } from "./componets/timer_session";
import "./globals.css";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Metrología USC | MetroSoft",
  description: "Sistema de gestión del laboratorio de Metrología USC.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Convertimos el RootLayout en una función asíncrona para leer la sesión en el servidor
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  // 🚀 Traemos la sesión directamente desde las cookies del servidor en tiempo de renderizado
  const session = await auth();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 🎯 Le inyectamos la sesión directo al Wrapper */}
        <SessionWrapper session={session}>
          <DbProvider>
            {children}
            <IdleMonitor />
            <Toaster position="top-right" richColors />

          </DbProvider>
        </SessionWrapper>
      </body>
    </html>
  );
}

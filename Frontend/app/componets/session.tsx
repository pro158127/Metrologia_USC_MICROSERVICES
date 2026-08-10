"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  session: any; // 👈 Recibe la sesión que le mandamos desde el layout de servidor
}

export default function SessionWrapper({ children, session }: Props) {
  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  );
}
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EAGLE TRADES — Trading Dashboard", description: "Paper-trading dashboard for multi-account trade copying." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
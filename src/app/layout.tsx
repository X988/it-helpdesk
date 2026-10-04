import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import "./globals.css";
export const metadata: Metadata = { title: "IT Help Desk", description: "Внутренняя служба IT-поддержки", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><a className="skipLink" href="#content">Перейти к содержимому</a><Navigation />{children}<footer className="shell muted">IT Help Desk · Внутренняя служба поддержки</footer></body></html>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "IT Help Desk", description: "Internal IT support service desk" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>{children}</body></html>;
}

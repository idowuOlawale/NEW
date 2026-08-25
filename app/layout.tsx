import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Statemently — OPay Statement Analyzer",
  description: "Upload an OPay statement and understand your money flow at a glance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

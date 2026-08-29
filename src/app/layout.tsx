import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Done Admin",
  description:
    "Internal admin console for Done — a local on-demand task marketplace. Manage users, live jobs, disputes, payments, and platform settings.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}

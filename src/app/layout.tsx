import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://admin.done.app";
const title = "Done Admin";
const description =
  "Internal admin console for Done — a local on-demand task marketplace. Manage users, live jobs, disputes, payments, and platform settings.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  // Internal tool only — never indexed, never previewed as a public link.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
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

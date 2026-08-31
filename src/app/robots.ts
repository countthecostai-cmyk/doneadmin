import type { MetadataRoute } from "next";

// Internal admin console — never indexed, never crawled. Belt-and-suspenders
// alongside the per-page `robots: { index: false }` metadata in layout.tsx:
// this covers crawlers that only ever check robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}

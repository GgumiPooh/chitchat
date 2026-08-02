import type { MetadataRoute } from "next";

// INFO: REQUIREMENTS.md § 14. Index blocking, layer 1 of 3. No sitemap is generated, deliberately.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}

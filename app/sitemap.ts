import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// Public, indexable routes. Auth-gated app pages are intentionally included
// so search/GEO systems can discover what the product covers; auth walls
// still apply at runtime.
const ROUTES = [
  "",
  "/curve",
  "/portfolio",
  "/portfolios",
  "/compare",
  "/history",
  "/reports",
  "/validate",
  "/login",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route || "/"}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/privacy" || route === "/terms" ? 0.3 : 0.7,
  }));
}

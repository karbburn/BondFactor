import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} | Fixed Income Risk Engine for Indian G-Secs`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f13",
    theme_color: "#0e0f13",
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
    ],
  };
}

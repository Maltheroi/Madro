import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Madro – madplan, makroer og indkøb",
    short_name: "Madro",
    description: "Personlig madplan, madregistrering, vægt og indkøbsliste.",
    lang: "da",
    start_url: "/oversigt",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf7",
    theme_color: "#2a5745",
    categories: ["health", "food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Madregistrering", url: "/madregistrering" },
      { name: "Madplan", url: "/madplan" },
      { name: "Indkøbsliste", url: "/indkobsliste" },
    ],
  };
}

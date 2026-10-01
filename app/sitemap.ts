import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://afiqueerescortsecosystem.com";
  const routes = ["/", "/customer", "/customer/explore", "/customer/shop"];
  return routes.map((path) => ({
    url: base + path,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}

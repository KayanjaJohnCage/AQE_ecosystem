import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AfriQueer Escorts Ecosystem",
  description: "AfriQueer Escorts Ecosystem — verified profiles, secure payments and community tools.",
  manifest: "/manifest.json",
  icons: {
    icon: "/AQE-Nav&Icon.jpeg",
    apple: "/AQE-Nav&Icon.jpeg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b11",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CustomerPage() {
  return (
    <main className="aqe-original-host">
      <iframe
        title="AfriQueer Escorts Ecosystem"
        className="aqe-original-frame"
        src="/aqe-original.html"
      />
    </main>
  );
}

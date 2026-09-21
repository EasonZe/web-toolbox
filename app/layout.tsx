import type { Metadata } from "next";
import { headers } from "next/headers";
import FloatingDock from "./components/floating-dock";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "多功能工具箱",
    icons: {
      icon: [{ url: "/images/toolbox-logo.png", type: "image/png" }],
      shortcut: "/images/toolbox-logo.png",
      apple: "/images/toolbox-logo.png",
    },
    openGraph: {
      title: "多功能工具箱",
      type: "website",
      images: [
        {
          url: "/images/toolbox-logo.png",
          width: 1280,
          height: 1280,
          alt: "多功能工具箱项目标志",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: "多功能工具箱",
      images: ["/images/toolbox-logo.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <FloatingDock />
      </body>
    </html>
  );
}

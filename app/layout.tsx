import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import FloatingDock from "./components/floating-dock";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  const description =
    "一个域名下的视频解析，以及视频、音频、图片、ASCII字符画、二维码和颜色格式工具箱。";

  return {
    metadataBase,
    title: "Eason的工具箱",
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Eason的工具箱",
      description,
      type: "website",
      images: [
        {
          url: new URL("/og-tools-v12.png", metadataBase).toString(),
          alt: "Eason的工具箱：视频解析、音视频处理、图片转换与压缩、二维码和颜色工具",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Eason的工具箱",
      description,
      images: [new URL("/og-tools-v12.png", metadataBase).toString()],
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <FloatingDock />
      </body>
    </html>
  );
}

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
      <head>
        <style>{`
          @media (hover: none) and (pointer: coarse) {
            .tool-card-shell:hover > .tool-card.is-touch-entering,
            .tool-card-shell > .tool-card.is-touch-entering,
            .tool-card.is-touch-entering:active {
              transform: translateY(-5px) !important;
              border-color: var(--blue-hover) !important;
              box-shadow: var(--shadow) !important;
            }

            .tool-card-shell:hover > .tool-card.is-touch-entering .tool-icon,
            .tool-card-shell > .tool-card.is-touch-entering .tool-icon,
            .tool-card.is-touch-entering:active .tool-icon {
              transform: translateY(-2px) !important;
              border-color: var(--blue-hover) !important;
              background: linear-gradient(145deg, var(--surface-icon-start), var(--blue)) !important;
              box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 9px 18px color-mix(in srgb, var(--ui-accent) 14%, transparent) !important;
            }

            .tool-card-shell:hover > .tool-card.is-touch-entering .tool-action,
            .tool-card-shell > .tool-card.is-touch-entering .tool-action,
            .tool-card.is-touch-entering:active .tool-action {
              border-color: var(--blue-hover) !important;
              box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 8px 18px color-mix(in srgb, var(--ui-accent) 14%, transparent) !important;
            }

            .tool-card-shell:hover > .tool-card.is-touch-entering .tool-action::before,
            .tool-card-shell > .tool-card.is-touch-entering .tool-action::before,
            .tool-card.is-touch-entering:active .tool-action::before {
              transform: scaleX(1) !important;
            }

            .tool-card-shell:hover > .tool-card.is-touch-entering .tool-arrow,
            .tool-card-shell > .tool-card.is-touch-entering .tool-arrow,
            .tool-card.is-touch-entering:active .tool-arrow {
              width: calc(100% - 24px) !important;
              color: #fff !important;
              filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--ui-accent) 24%, transparent)) !important;
            }
          }
        `}</style>
      </head>
      <body>
        {children}
        <FloatingDock />
      </body>
    </html>
  );
}

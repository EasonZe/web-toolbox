import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "user15484.cn.imgto.link",
        pathname: "/public/**",
      },
    ],
  },
};

export default nextConfig;

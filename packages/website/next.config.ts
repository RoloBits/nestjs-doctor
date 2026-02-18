import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "export",
	basePath: "/nestjs-doctor",
	images: { unoptimized: true },
};

export default nextConfig;

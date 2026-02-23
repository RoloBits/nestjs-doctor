import createMDX from "@next/mdx";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "export",
	images: { unoptimized: true },
	pageExtensions: ["tsx", "ts", "mdx"],
};

const withMDX = createMDX({
	options: {
		remarkPlugins: [["remark-gfm"]],
		rehypePlugins: [["rehype-slug"]],
	},
});

export default withMDX(nextConfig);

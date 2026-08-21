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
		rehypePlugins: [
			["rehype-slug"],
			[
				"rehype-pretty-code",
				{
					theme: "github-dark-default",
					defaultLang: "text",
					keepBackground: false,
				},
			],
		],
	},
});

export default withMDX(nextConfig);

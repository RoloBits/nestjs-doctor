import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadPlexMono } from "@/lib/og-font";

export const dynamic = "force-static";
export const alt =
	"NestJS Doctor - The deterministic NestJS devtool that catches AI mistakes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
	const [fonts, logo] = await Promise.all([
		loadPlexMono(),
		readFile(join(process.cwd(), "public/logo.png")),
	]);
	const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: "#0a0a0a",
				borderTop: "6px solid #ea2845",
				padding: "72px 88px",
				fontFamily: '"IBM Plex Mono", monospace',
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 32 }}>
				{/* biome-ignore lint/performance/noImgElement: satori renders plain img tags */}
				<img
					alt=""
					height={110}
					src={logoSrc}
					style={{ borderRadius: 14 }}
					width={110}
				/>
				<div
					style={{
						display: "flex",
						fontSize: 64,
						fontWeight: 600,
						color: "#f4fdff",
						letterSpacing: 2,
					}}
				>
					NESTJS-DOCTOR
				</div>
			</div>

			<div
				style={{
					display: "flex",
					fontSize: 34,
					color: "#a3a3a3",
					lineHeight: 1.4,
					maxWidth: 900,
				}}
			>
				{"The deterministic NestJS devtool that catches AI mistakes."}
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 20,
						border: "1px solid #333",
						background: "#000",
						padding: "22px 32px",
						fontSize: 30,
						color: "#d4d4d4",
					}}
				>
					<div style={{ display: "flex", color: "#ea2845" }}>$</div>
					<div style={{ display: "flex" }}>npx nestjs-doctor@latest .</div>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 16,
						fontSize: 30,
						color: "#4ade80",
					}}
				>
					<div
						style={{
							display: "flex",
							width: 22,
							height: 22,
							borderRadius: 11,
							border: "4px solid #4ade80",
						}}
					/>
					<div style={{ display: "flex" }}>93 / 100</div>
				</div>
			</div>
		</div>,
		{ ...size, fonts }
	);
}

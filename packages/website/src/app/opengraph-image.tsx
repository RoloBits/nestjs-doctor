import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "NestJS Doctor - Diagnose and fix your NestJS code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_CSS =
	"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap";
const FONT_URL_RE = /url\((https:[^)]+)\)/;

/** Downloads one weight of IBM Plex Mono through the same host next/font uses. */
async function plexMono(weight: number): Promise<ArrayBuffer | null> {
	try {
		const css = await (
			await fetch(`${FONT_CSS}`, { headers: { "User-Agent": "Mozilla/5.0" } })
		).text();
		const block = css
			.split("@font-face")
			.find((part) => part.includes(`font-weight: ${weight}`));
		const url = block?.match(FONT_URL_RE)?.[1];
		if (!url) {
			return null;
		}
		return await (await fetch(url)).arrayBuffer();
	} catch {
		return null;
	}
}

export default async function Image() {
	const [regular, semibold] = await Promise.all([plexMono(400), plexMono(600)]);
	const fonts: { data: ArrayBuffer; name: string; weight: 400 | 600 }[] = [];
	if (regular) {
		fonts.push({ name: "IBM Plex Mono", data: regular, weight: 400 as const });
	}
	if (semibold) {
		fonts.push({ name: "IBM Plex Mono", data: semibold, weight: 600 as const });
	}

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
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 12,
						width: 120,
						height: 88,
						borderRadius: 10,
						border: "3px solid #ea2845",
						background: "#140507",
					}}
				>
					<div
						style={{
							width: 14,
							height: 14,
							borderRadius: 7,
							background: "#ea2845",
						}}
					/>
					<div
						style={{
							width: 14,
							height: 14,
							borderRadius: 7,
							background: "#ea2845",
						}}
					/>
					<div
						style={{
							width: 14,
							height: 14,
							borderRadius: 7,
							background: "#ea2845",
						}}
					/>
				</div>
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
				{"Diagnose and fix your NestJS code in one command."}
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
		{ ...size, fonts: fonts.length > 0 ? fonts : undefined }
	);
}

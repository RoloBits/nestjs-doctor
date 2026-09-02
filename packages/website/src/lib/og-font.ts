const FONT_CSS =
	"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap";
const FONT_URL_RE = /url\((https:[^)]+)\)/;

export interface OgFont {
	data: ArrayBuffer;
	name: string;
	weight: 400 | 600;
}

/** Downloads one weight of IBM Plex Mono through the same host next/font uses. */
async function plexMono(weight: 400 | 600): Promise<OgFont | null> {
	try {
		const cssRes = await fetch(FONT_CSS, {
			headers: { "User-Agent": "Mozilla/5.0" },
		});
		if (!cssRes.ok) {
			return null;
		}
		const css = await cssRes.text();
		const block = css
			.split("@font-face")
			.find((part) => part.includes(`font-weight: ${weight}`));
		const url = block?.match(FONT_URL_RE)?.[1];
		if (!url) {
			return null;
		}
		const fontRes = await fetch(url);
		if (!fontRes.ok) {
			return null;
		}
		return { name: "IBM Plex Mono", data: await fontRes.arrayBuffer(), weight };
	} catch {
		return null;
	}
}

/** The regular and semibold weights that resolved, for ImageResponse. */
export async function loadPlexMono(): Promise<OgFont[] | undefined> {
	const fonts = await Promise.all([plexMono(400), plexMono(600)]);
	const loaded = fonts.filter((font): font is OgFont => font !== null);
	return loaded.length > 0 ? loaded : undefined;
}

#!/usr/bin/env node
// Collapses the Next.js static export in out/ into one self-contained file:
// scripts and stylesheets referenced from /_next/ are inlined, font/image
// refs inside CSS become data URIs, preload hints are dropped.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "out");
const DIST_DIR = join(import.meta.dirname, "..", "dist");

const MIME = {
	".woff2": "font/woff2",
	".woff": "font/woff",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".ico": "image/x-icon",
};

function readAsset(urlPath) {
	return readFileSync(join(OUT_DIR, urlPath));
}

function toDataUri(urlPath) {
	const mime = MIME[extname(urlPath)] ?? "application/octet-stream";
	return `data:${mime};base64,${readAsset(urlPath).toString("base64")}`;
}

/** Rewrites url(/_next/...) refs inside CSS text to data URIs. */
function inlineCssUrls(css) {
	return css.replace(
		/url\((['"]?)(\/_next\/[^)'"]+)\1\)/g,
		(_, quote, path) => {
			return `url(${quote ? `"${toDataUri(path)}"` : toDataUri(path)})`;
		}
	);
}

let html = readFileSync(join(OUT_DIR, "index.html"), "utf8");

// Normalise Windows separators in asset URLs only; a document-wide pass
// would corrupt backslashes embedded in inline script payloads.
html = html.replaceAll(/(src|href)="([^"]*)"/g, (_, attr, value) => {
	return `${attr}="${value.replaceAll("\\", "/")}"`;
});

/** Matches the minified getAssetPrefix() whose invariant requires reading
 * asset hints off external script src attributes. */
const GET_ASSET_PREFIX_RE =
	/function (\w+)\(\)\{let \w+=document\.currentScript;if\(!\(\w+ instanceof HTMLScriptElement\)\)[\s\S]*?E783[\s\S]*?\);let\{pathname:\w+\}=new URL\(\w+\.src\),\w+=\w+\.indexOf\("\/_next\/"\);if\(-1===[\s\S]*?return [\w.]+\.slice\(0,\w+\)\}/;

function patchChunkCode(code) {
	let patched = code
		.replaceAll(
			'e.getAttribute("src")',
			'e.getAttribute("data-chunk")||e.getAttribute("src")'
		)
		.replaceAll(
			'e.src.replace(/[?#].*$/,"")',
			'(e.src||"").replace(/[?#].*$/,"")'
		);
	patched = neutralizeGetAssetPrefix(patched);
	return patched.replace(/<\/script/gi, "<\\/script");
}

function neutralizeGetAssetPrefix(code) {
	const match = code.match(GET_ASSET_PREFIX_RE);
	if (!match) {
		return code;
	}
	return code.replace(match[0], `function ${match[1]}(){return ""}`);
}

const chunkPaths = [];
html = html.replace(
	/<script\b([^>]*?)\ssrc="(\/_next\/[^"]+)"([^>]*)><\/script>/g,
	(_, before, src, after) => {
		chunkPaths.push(src);
		return `<script${before} data-chunk="${src}"${after}>${patchChunkCode(readAsset(src).toString("utf8"))}</script>`;
	}
);

// The runtime resolves chunk identities through src lookups when a script
// tag is absent, so hand it the paths in execution order (reversed queue).
if (chunkPaths.length > 0) {
	const prelude = `<script>window.TURBOPACK_NEXT_CHUNK_URLS=${JSON.stringify(
		chunkPaths.slice().reverse()
	)};</script>`;
	html = html.replace(/<head([^>]*)>/, `<head$1>${prelude}`);
}

// The chunk loader probes the DOM for each expected chunk before creating a
// network <script>; stub tags with an inert type satisfy those probes
// without triggering a fetch.
html = html.replace(
	"</body>",
	`${chunkPaths
		.map((path) => `<script type="application/json" src="${path}"></script>`)
		.join("")}</body>`
);

/** Inlines a stylesheet <link> tag's target CSS, fonts/images included. */
function styleTag(href) {
	const css = inlineCssUrls(readAsset(href).toString("utf8"));
	return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
}

html = html.replace(
	/<link\b([^>]*?)\shref="(\/_next\/[^"]+)"([^>]*?)\srel="stylesheet"([^>]*)>/g,
	(_m, _before, href) => styleTag(href)
);

html = html.replace(
	/<link\b([^>]*?)\srel="stylesheet"([^>]*?)\shref="(\/_next\/[^"]+)"([^>]*)>/g,
	(_m, _before, _mid, href) => styleTag(href)
);

html = html.replace(
	/<link\b[^>]*\srel="(?:preload|modulepreload|prefetch)"[^>]*\shref="\/_next\/[^"]*"[^>]*\/?>/g,
	""
);
html = html.replace(
	/<link\b[^>]*\shref="\/_next\/[^"]*"[^>]*\srel="(?:preload|modulepreload|prefetch)"[^>]*\/?>/g,
	""
);

const leaked = html.match(
	/(?<!type="application\/json" )(?:src|href)="\/_next\/[^"]*"/g
);
if (leaked?.length) {
	console.error(
		`inline-report: unresolved asset references:\n${leaked.join("\n")}`
	);
	process.exit(1);
}

mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(join(DIST_DIR, "index.html"), html);
console.log(
	`inline-report: wrote dist/index.html (${(html.length / 1024).toFixed(0)} KB)`
);

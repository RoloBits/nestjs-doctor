import { ICONS, type IconName } from "./icons.js";

const SVG_SHAPE = /^<svg ([^>]*)>([\s\S]*)<\/svg>$/;
const ATTR = /([a-zA-Z-]+)="([^"]*)"/g;

const ATTR_TO_PROP: Record<string, string> = {
	"stroke-width": "strokeWidth",
	"stroke-linecap": "strokeLinecap",
	"stroke-linejoin": "strokeLinejoin",
	"fill-rule": "fillRule",
	"clip-rule": "clipRule",
};

interface ParsedIcon {
	attrs: Record<string, string>;
	inner: string;
}

const parsedIcons = new Map<IconName, ParsedIcon>();

// Splits a stored `<svg ...>...</svg>` string into its attributes and body.
function parseIcon(name: IconName): ParsedIcon {
	let parsed = parsedIcons.get(name);
	if (parsed) {
		return parsed;
	}
	const match = ICONS[name].match(SVG_SHAPE);
	const attrs: Record<string, string> = {};
	if (match) {
		for (const [, key, value] of (match[1] as string).matchAll(ATTR)) {
			attrs[ATTR_TO_PROP[key as string] ?? (key as string)] = value as string;
		}
	}
	parsed = { attrs, inner: match ? (match[2] as string) : "" };
	parsedIcons.set(name, parsed);
	return parsed;
}

export interface IconProps {
	ariaHidden?: boolean;
	classes?: string;
	id?: string;
	name: IconName;
	size?: number;
	stroke?: string;
	strokeWidth?: string;
}

export function Icon({
	name,
	size,
	stroke,
	strokeWidth,
	classes,
	id,
	ariaHidden,
}: IconProps) {
	const { attrs, inner } = parseIcon(name);
	return (
		<svg
			{...attrs}
			aria-hidden={ariaHidden || undefined}
			className={classes}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted SVG bodies from our own icon atom
			dangerouslySetInnerHTML={{ __html: inner }}
			height={size}
			id={id}
			stroke={stroke ?? attrs.stroke}
			strokeWidth={strokeWidth ?? attrs.strokeWidth}
			width={size}
		/>
	);
}

import type { CSSProperties, ReactNode } from "react";

interface BadgeProps {
	children: ReactNode;
	classes?: string;
	id?: string;
	style?: CSSProperties;
	tip?: string;
	title?: string;
	variant?: string;
}

// A pill in the module detail panel. `variant` picks the colour class and
// `classes` carries the tooltip helpers some badges add.
export function Badge({
	children,
	variant,
	classes,
	id,
	style,
	title,
	tip,
}: BadgeProps) {
	const className = ["md-badge", variant, classes].filter(Boolean).join(" ");
	return (
		<span
			className={className}
			data-tip={tip}
			id={id}
			style={style}
			title={title}
		>
			{children}
		</span>
	);
}

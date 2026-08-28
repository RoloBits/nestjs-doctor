import type { CSSProperties, ReactNode } from "react";

interface HeadingProps {
	children?: ReactNode;
	classes?: string;
	id?: string;
	level: 1 | 2 | 3 | 4 | 5 | 6;
	style?: CSSProperties;
	tip?: string;
}

// Renders one heading; `tip` adds the has-tip class the floating tooltip binds to.
export function Heading({
	level,
	children,
	id,
	classes,
	style,
	tip,
}: HeadingProps) {
	const Tag = `h${level}` as "h1";
	const cls = [classes, tip ? "has-tip" : undefined].filter(Boolean).join(" ");
	return (
		<Tag className={cls || undefined} data-tip={tip} id={id} style={style}>
			{children}
		</Tag>
	);
}

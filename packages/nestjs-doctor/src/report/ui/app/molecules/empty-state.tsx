import type { ReactNode } from "react";
import { Icon, type IconProps } from "../atoms/icon.js";

interface EmptyStateProps {
	classes?: string;
	extra?: ReactNode;
	icon: IconProps;
	id?: string;
	style?: { display?: string };
	text: string;
}

// An empty-state panel: an icon over a one-line message, with an optional
// trailing element.
export function EmptyState({
	id,
	classes,
	icon,
	text,
	extra,
	style,
}: EmptyStateProps) {
	return (
		<div className={classes} id={id} style={style}>
			<Icon {...icon} />
			<p>{text}</p>
			{extra}
		</div>
	);
}

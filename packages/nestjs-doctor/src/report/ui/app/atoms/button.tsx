import type { ReactNode } from "react";
import type { IconName } from "../../atoms/icon.js";
import { Icon } from "./icon.js";

interface IconButtonProps {
	ariaLabel?: string;
	icon: IconName;
	id?: string;
	modifier?: string;
	onClick?: () => void;
	tip?: string;
	title?: string;
}

// An `st-btn` icon button. `tip` adds the has-tip class the floating
// tooltip binds to.
export function IconButton({
	id,
	icon,
	modifier,
	ariaLabel,
	tip,
	title,
	onClick,
}: IconButtonProps) {
	const classes = ["st-btn", modifier, tip ? "has-tip" : undefined]
		.filter(Boolean)
		.join(" ");
	return (
		<button
			aria-label={ariaLabel}
			className={classes}
			data-tip={tip}
			id={id}
			onClick={onClick}
			title={title}
			type="button"
		>
			<Icon name={icon} />
		</button>
	);
}

interface TextButtonProps {
	ariaExpanded?: boolean;
	ariaLabel?: string;
	children: ReactNode;
	classes?: string;
	id?: string;
	onClick?: () => void;
}

// A button whose face is arbitrary content instead of a lone icon.
export function TextButton({
	id,
	classes,
	ariaExpanded,
	ariaLabel,
	onClick,
	children,
}: TextButtonProps) {
	return (
		<button
			aria-expanded={ariaExpanded}
			aria-label={ariaLabel}
			className={classes}
			id={id}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}

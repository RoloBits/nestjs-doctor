import type { ReactNode } from "react";

interface TreeRowProps {
	/** Content between the toggle and the label, in place of an icon. */
	before?: ReactNode;
	classes?: string;
	depth: number;
	/** Trailing content, typically a count badge. */
	extra?: ReactNode;
	icon?: ReactNode;
	label: ReactNode;
	onClick?: () => void;
	onToggle?: () => void;
	toggleGlyph?: string;
}

// One row of a sidebar tree, shared by the panels that differ only in
// which slots they fill.
export function TreeRow({
	depth,
	label,
	toggleGlyph,
	icon,
	before,
	extra,
	classes,
	onClick,
	onToggle,
}: TreeRowProps) {
	const rowClasses = ["st-row", classes].filter(Boolean).join(" ");
	const indents: ReactNode[] = [];
	for (let i = 0; i < depth; i++) {
		indents.push(<span className="st-indent" key={i} />);
	}
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the whole row is the click target, as in the report's CSS
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the whole row is the click target, as in the report's CSS
		// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only tree
		<div className={rowClasses} onClick={onClick}>
			{indents}
			{onToggle ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: the glyph is the toggle target, as in the report's CSS
				// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the glyph is the toggle target, as in the report's CSS
				// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only tree
				<span
					className="st-toggle"
					onClick={(e) => {
						e.stopPropagation();
						onToggle();
					}}
				>
					{toggleGlyph}
				</span>
			) : (
				<span className="st-indent" />
			)}
			{icon && <span className="st-icon">{icon}</span>}
			{before}
			<span className="st-label">{label}</span>
			{extra}
		</div>
	);
}

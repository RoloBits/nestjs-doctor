import type { ReactNode } from "react";
import { IconButton } from "../atoms/button.js";

interface SidebarHeaderProps {
	classes?: string;
	count: number;
	countId?: string;
	title: string;
	titleId?: string;
	toolbar?: ReactNode;
}

// A sidebar's header row: title, entity count, spacer, and the optional
// toolbar cluster after them.
export function SidebarHeader({
	title,
	titleId,
	count,
	countId,
	toolbar,
	classes = "schema-sidebar-header",
}: SidebarHeaderProps) {
	return (
		<div className={classes}>
			<span className="schema-sidebar-title" id={titleId}>
				{title}
			</span>
			<span className="schema-entity-count" id={countId}>
				{count}
			</span>
			<span style={{ flex: 1 }} />
			{toolbar}
		</div>
	);
}

interface TreeToolbarProps {
	noun: string;
	onCollapseAll: () => void;
	onExpandAll: () => void;
	onHide?: () => void;
	prefix: string;
	subject?: string;
}

// The expand-all / collapse-all cluster on a sidebar tree, plus the hide
// button when `subject` names what gains the reclaimed width.
export function TreeToolbar({
	prefix,
	noun,
	subject,
	onExpandAll,
	onCollapseAll,
	onHide,
}: TreeToolbarProps) {
	return (
		<>
			<IconButton
				ariaLabel="Expand all"
				icon="expandAll"
				id={`${prefix}-expand-all`}
				onClick={onExpandAll}
				tip={`Expand all · open every ${noun} in the list`}
			/>
			<IconButton
				ariaLabel="Collapse all"
				icon="collapseAll"
				id={`${prefix}-collapse-all`}
				onClick={onCollapseAll}
				tip={`Collapse all · close every ${noun} in the list`}
			/>
			{subject && (
				<IconButton
					ariaLabel={`Hide the ${noun} list`}
					icon="sidebarCollapse"
					id={`${prefix}-sidebar-collapse`}
					onClick={onHide}
					tip={`Hide list · give the ${subject} the whole width`}
				/>
			)}
		</>
	);
}

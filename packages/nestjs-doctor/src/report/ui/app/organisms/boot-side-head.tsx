import { IconButton } from "../atoms/button.js";
import { SearchField } from "../molecules/search-field.js";
import { SidebarHeader, TreeToolbar } from "../molecules/sidebar-header.js";

interface BootSideHeadProps {
	classCount: number;
	/** The graph dock's slimmer head: a count and the tree controls only. */
	compact?: boolean;
	/** The list is hidden; only the button that brings it back shows. */
	hidden?: boolean;
	onCollapseAll: () => void;
	onExpandAll: () => void;
	onHide: () => void;
	onQueryChange: (value: string) => void;
	/** Enter in the filter steps to the next match. */
	onQueryEnter: () => void;
	onShow: () => void;
	query: string;
}

// The head of the label column: the sidebar header the other tabs have,
// with the class count, the tree controls, and the filter under them.
export function BootSideHead({
	classCount,
	compact,
	hidden,
	onCollapseAll,
	onExpandAll,
	onHide,
	onQueryChange,
	onQueryEnter,
	onShow,
	query,
}: BootSideHeadProps) {
	if (hidden) {
		return (
			<div className="boot-side-head boot-side-mini">
				<IconButton
					ariaLabel="Show the module list"
					icon="sidebarShow"
					id="boot-sidebar-show"
					modifier="schema-diagram-btn"
					onClick={onShow}
					tip="Show list · bring the module list back"
				/>
			</div>
		);
	}
	const prefix = compact ? "boot-dock" : "boot";
	return (
		<div className="boot-side-head">
			<SidebarHeader
				classes={compact ? "schema-sidebar-header boot-dock-header" : undefined}
				count={classCount}
				countId={`${prefix}-class-count`}
				title={compact ? "Classes" : "Boot trace"}
				toolbar={
					<TreeToolbar
						noun="module"
						onCollapseAll={onCollapseAll}
						onExpandAll={onExpandAll}
						onHide={compact ? undefined : onHide}
						prefix={prefix}
						subject={compact ? undefined : "timeline"}
					/>
				}
			/>
			<SearchField
				id={compact ? "boot-search-compact" : "boot-search"}
				onChange={onQueryChange}
				onEnter={onQueryEnter}
				placeholder="Filter classes and modules"
				value={query}
			/>
		</div>
	);
}

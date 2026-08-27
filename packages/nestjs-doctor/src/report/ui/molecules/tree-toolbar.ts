import { iconButton } from "../atoms/button.js";

interface TreeToolbarOptions {
	noun: string;
	prefix: string;
	subject?: string;
}

// The expand-all / collapse-all cluster on a sidebar tree, plus the hide
// button when `subject` names what gains the reclaimed width.
export function treeToolbar({
	prefix,
	noun,
	subject,
}: TreeToolbarOptions): string {
	const buttons = [
		iconButton({
			id: `${prefix}-expand-all`,
			icon: "expandAll",
			ariaLabel: "Expand all",
			tip: `Expand all · open every ${noun} in the list`,
		}),
		iconButton({
			id: `${prefix}-collapse-all`,
			icon: "collapseAll",
			ariaLabel: "Collapse all",
			tip: `Collapse all · close every ${noun} in the list`,
		}),
	];
	if (subject) {
		buttons.push(
			iconButton({
				id: `${prefix}-sidebar-collapse`,
				icon: "sidebarCollapse",
				ariaLabel: `Hide the ${noun} list`,
				tip: `Hide list · give the ${subject} the whole width`,
			})
		);
	}
	return buttons.join("\n");
}

// The matching bring-the-list-back button, rendered where the sidebar
// reappears from.
export function sidebarShowButton({
	prefix,
	noun,
	indent,
}: {
	indent: number;
	noun: string;
	prefix: string;
}): string {
	return iconButton({
		id: `${prefix}-sidebar-show`,
		icon: "sidebarShow",
		ariaLabel: `Show the ${noun} list`,
		tip: `Show list · bring the ${noun} list back`,
		indent,
	});
}

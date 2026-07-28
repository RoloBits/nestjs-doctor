import type { Node } from "ts-morph";

/**
 * 1-based column of a node on its own line. `getStartLinePos()` is the file
 * offset where that line begins, not a column, and is not usable on its own.
 */
export function columnOf(node: Node): number {
	return node.getStart() - node.getStartLinePos() + 1;
}

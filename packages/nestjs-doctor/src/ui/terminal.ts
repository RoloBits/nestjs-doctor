const FALLBACK_COLUMNS = 80;
const FALLBACK_ROWS = 24;

/** Substitutes a usable width for the zero a pty reports when it has no size. */
export const usableColumns = (columns?: number): number =>
	columns || FALLBACK_COLUMNS;

/** Substitutes a usable height for the zero a pty reports when it has no size. */
export const usableRows = (rows?: number): number => rows || FALLBACK_ROWS;

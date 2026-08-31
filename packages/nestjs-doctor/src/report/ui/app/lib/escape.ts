// Escapes a value for embedding in HTML text or a double-quoted attribute.
export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Escapes a value for a double-quoted attribute selector, e.g. [data-id="…"].
export function cssAttr(value: string): string {
	return value.replace(/["\\]/g, "\\$&");
}

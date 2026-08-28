// Escapes a value for embedding in HTML text or a double-quoted attribute.
export function escapeHtml(value: unknown): string {
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

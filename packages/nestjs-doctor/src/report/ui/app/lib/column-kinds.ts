interface SchemaColumn {
	hasIndex?: boolean;
	isPrimary?: boolean;
	isUnique?: boolean;
	name: string;
}

interface SchemaEntity {
	relations: { propertyName?: string }[];
}

const NON_ALNUM = /[^a-z0-9]/g;

// Normalises a column or property name for fuzzy matching.
export function keyName(text: unknown): string {
	return String(text).toLowerCase().replace(NON_ALNUM, "");
}

// A relation property's candidate FK column names: itself and with an Id suffix.
export function fkKeys(propertyName: string): [string, string] {
	const base = keyName(propertyName);
	return [base, `${base}id`];
}

// The normalised names an entity's relations could store their FK under.
export function foreignKeyColumns(
	entity: SchemaEntity
): Record<string, boolean> {
	const names: Record<string, boolean> = Object.create(null);
	for (const rel of entity.relations) {
		const prop = rel.propertyName;
		if (!prop) {
			continue;
		}
		const keys = fkKeys(prop);
		names[keys[0]] = true;
		names[keys[1]] = true;
	}
	return names;
}

// Classifies a column as pk, fk, idx, or nothing.
export function columnKind(
	column: SchemaColumn,
	foreignKeys: Record<string, boolean>
): string | null {
	if (column.isPrimary) {
		return "pk";
	}
	if (foreignKeys[keyName(column.name)]) {
		return "fk";
	}
	if (column.isUnique || column.hasIndex) {
		return "idx";
	}
	return null;
}

interface CheckboxRowProps {
	checked: boolean;
	id?: string;
	label: string;
	onChange: (checked: boolean) => void;
	rowId?: string;
	style?: { display?: string };
	tip?: string;
}

// A `schema-sync` label wrapping a checkbox and its caption. `tip` adds the
// has-tip class the floating tooltip binds to.
export function CheckboxRow({
	id,
	label,
	checked,
	onChange,
	tip,
	rowId,
	style,
}: CheckboxRowProps) {
	const classes = ["schema-sync", tip ? "has-tip" : undefined]
		.filter(Boolean)
		.join(" ");
	return (
		<label className={classes} data-tip={tip} id={rowId} style={style}>
			<input
				checked={checked}
				id={id}
				onChange={(e) => onChange(e.target.checked)}
				type="checkbox"
			/>
			<span>{label}</span>
		</label>
	);
}

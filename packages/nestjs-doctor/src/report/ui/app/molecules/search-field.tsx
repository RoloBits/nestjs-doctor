interface SearchFieldProps {
	/** Wrapper class; defaults to the sidebar search box. */
	classes?: string;
	id?: string;
	onChange: (value: string) => void;
	/** Fires on Enter, for search boxes that step through matches. */
	onEnter?: () => void;
	placeholder: string;
	value: string;
}

// A sidebar search box inside its `mg-side-search` wrapper.
export function SearchField({
	classes = "mg-side-search",
	id,
	placeholder,
	value,
	onChange,
	onEnter,
}: SearchFieldProps) {
	return (
		<div className={classes}>
			<input
				autoComplete="off"
				id={id}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						onEnter?.();
					}
				}}
				placeholder={placeholder}
				spellCheck={false}
				type="search"
				value={value}
			/>
		</div>
	);
}

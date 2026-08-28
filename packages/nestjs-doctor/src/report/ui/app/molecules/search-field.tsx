interface SearchFieldProps {
	id?: string;
	onChange: (value: string) => void;
	placeholder: string;
	value: string;
}

// A sidebar search box inside its `mg-side-search` wrapper.
export function SearchField({
	id,
	placeholder,
	value,
	onChange,
}: SearchFieldProps) {
	return (
		<div className="mg-side-search">
			<input
				autoComplete="off"
				id={id}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				spellCheck={false}
				type="search"
				value={value}
			/>
		</div>
	);
}

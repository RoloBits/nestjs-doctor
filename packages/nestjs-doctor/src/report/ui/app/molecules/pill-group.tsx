interface PillGroupProps {
	active: string;
	items: { label: string; value: string }[];
	name: string;
	onSelect: (value: string) => void;
}

// One row of filter pills sharing a name. `name` is both the class prefix
// and the data attribute, matching the report's CSS.
export function PillGroup({ name, items, active, onSelect }: PillGroupProps) {
	return (
		<>
			{items.map((item) => (
				<button
					className={[
						`${name}-pill`,
						active === item.value ? "active" : undefined,
					]
						.filter(Boolean)
						.join(" ")}
					key={item.value}
					onClick={() => onSelect(item.value)}
					type="button"
					{...{ [`data-${name}`]: item.value }}
				>
					{item.label}
				</button>
			))}
		</>
	);
}

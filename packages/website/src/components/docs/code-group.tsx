"use client";

import { useState } from "react";

export const CodeGroup = ({
	labels,
	children,
}: {
	labels: string[];
	children: React.ReactNode[];
}) => {
	const [active, setActive] = useState(0);

	return (
		<div className="mb-4 overflow-hidden rounded border border-white/10">
			<div className="flex border-white/10 border-b bg-[#111]">
				{labels.map((label, i) => (
					<button
						className={`px-4 py-2 text-sm transition-colors ${
							i === active
								? "border-nest-red border-b-2 text-white"
								: "text-neutral-500 hover:text-neutral-300"
						}`}
						key={label}
						onClick={() => setActive(i)}
						type="button"
					>
						{label}
					</button>
				))}
			</div>
			<div className="[&>pre]:mb-0 [&>pre]:rounded-none [&>pre]:border-0">
				{children[active]}
			</div>
		</div>
	);
};

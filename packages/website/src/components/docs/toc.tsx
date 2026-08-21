"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Heading {
	depth: number;
	id: string;
	text: string;
}

const HEADING_SELECTOR = ".docs-content h2[id], .docs-content h3[id]";
const ACTIVE_ZONE_TOP = 0.12;
const ACTIVE_ZONE_BOTTOM = 0.55;

export const Toc = () => {
	const pathname = usePathname();
	const [headings, setHeadings] = useState<Heading[]>([]);
	const [activeId, setActiveId] = useState<string>("");

	// The layout stays mounted across docs routes, so the path is the signal to
	// re-read the headings even though the effect body never uses it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
	useEffect(() => {
		const found = [...document.querySelectorAll<HTMLElement>(HEADING_SELECTOR)]
			.filter((node) => node.textContent)
			.map((node) => ({
				depth: node.tagName === "H2" ? 2 : 3,
				id: node.id,
				text: node.textContent ?? "",
			}));
		setHeadings(found);
		setActiveId(found[0]?.id ?? "");

		if (found.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.map((entry) => entry.target.id);
				if (visible.length > 0) {
					setActiveId(visible[0]);
				}
			},
			{
				rootMargin: `-${ACTIVE_ZONE_TOP * 100}% 0px -${(1 - ACTIVE_ZONE_BOTTOM) * 100}% 0px`,
			}
		);
		for (const heading of found) {
			const node = document.getElementById(heading.id);
			if (node) {
				observer.observe(node);
			}
		}
		return () => observer.disconnect();
	}, [pathname]);

	if (headings.length < 2) {
		return null;
	}

	return (
		<nav
			aria-label="On this page"
			className="sticky top-8 hidden max-h-[calc(100dvh-6rem)] w-56 shrink-0 overflow-y-auto py-8 pr-6 xl:block"
		>
			<p className="mb-3 font-medium text-neutral-500 text-xs uppercase tracking-wider">
				On this page
			</p>
			<ul className="border-white/10 border-l">
				{headings.map((heading) => (
					<li key={heading.id}>
						<a
							className={`block py-1 text-sm transition-colors ${heading.depth === 3 ? "pl-6" : "pl-3"} ${
								activeId === heading.id
									? "-ml-px border-nest-red border-l text-white"
									: "text-neutral-500 hover:text-neutral-300"
							}`}
							href={`#${heading.id}`}
						>
							{heading.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
};

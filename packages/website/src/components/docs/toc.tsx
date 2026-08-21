"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface Heading {
	depth: number;
	id: string;
	text: string;
}

const HEADING_SELECTOR = ".docs-content h2[id], .docs-content h3[id]";
/** A heading counts as current once it passes this far up the viewport. */
const ACTIVE_OFFSET = 120;
const BOTTOM_SLACK = 2;

export const Toc = () => {
	const pathname = usePathname();
	const [headings, setHeadings] = useState<Heading[]>([]);
	const [activeId, setActiveId] = useState<string>("");
	const [marker, setMarker] = useState({ height: 0, top: 0 });
	const listRef = useRef<HTMLUListElement>(null);

	// Re-reads the headings on every docs route.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
	useEffect(() => {
		const found = [...document.querySelectorAll<HTMLElement>(HEADING_SELECTOR)]
			.map((node) => ({
				depth: node.tagName === "H2" ? 2 : 3,
				id: node.id,
				text: node.textContent ?? "",
			}))
			.filter((heading) => heading.text);
		setHeadings(found);

		if (found.length === 0) {
			setActiveId("");
			return;
		}

		const sync = () => {
			// Marks the last heading current once the page is scrolled to the end.
			const atBottom =
				window.innerHeight + window.scrollY >=
				document.body.scrollHeight - BOTTOM_SLACK;
			if (atBottom) {
				setActiveId(found.at(-1)?.id ?? "");
				return;
			}
			const passed = found.filter((heading) => {
				const node = document.getElementById(heading.id);
				return node ? node.getBoundingClientRect().top <= ACTIVE_OFFSET : false;
			});
			setActiveId((passed.at(-1) ?? found[0]).id);
		};

		sync();
		let frame = 0;
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(sync);
		};
		// The observer decides when to recompute; sync decides what is current.
		const observer = new IntersectionObserver(schedule, {
			threshold: [0, 1],
		});
		for (const heading of found) {
			const node = document.getElementById(heading.id);
			if (node) {
				observer.observe(node);
			}
		}
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [pathname]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: headings re-renders the rows this measures
	useEffect(() => {
		const list = listRef.current;
		if (!(list && activeId)) {
			return;
		}
		// Both offsets read 0 while the column is hidden below xl.
		const measure = () => {
			const row = list.querySelector<HTMLElement>(
				`[data-toc-id="${CSS.escape(activeId)}"]`
			);
			if (row?.offsetHeight) {
				setMarker({ height: row.offsetHeight, top: row.offsetTop });
			}
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [activeId, headings]);

	const handleClick = useCallback((id: string) => {
		setActiveId(id);
	}, []);

	if (headings.length < 2) {
		return null;
	}

	return (
		<nav
			aria-labelledby="toc-heading"
			className="sticky top-8 max-h-[calc(100dvh-6rem)] overflow-y-auto py-8 pr-6"
		>
			<p
				className="mb-3 font-medium text-neutral-500 text-xs uppercase tracking-wider"
				id="toc-heading"
			>
				On this page
			</p>
			<div className="relative">
				<span
					aria-hidden="true"
					className="absolute left-0 w-px bg-white/10"
					style={{ height: "100%" }}
				/>
				<span
					aria-hidden="true"
					className="absolute left-0 w-px bg-nest-red transition-[transform,height] duration-200 ease-out motion-reduce:transition-none"
					style={{
						height: `${marker.height}px`,
						transform: `translateY(${marker.top}px)`,
					}}
				/>
				<ul ref={listRef}>
					{headings.map((heading) => (
						<li key={heading.id}>
							<a
								aria-current={activeId === heading.id ? "true" : undefined}
								className={`block py-1.5 text-sm no-underline transition-colors ${heading.depth === 3 ? "pl-7" : "pl-4"} ${
									activeId === heading.id
										? "text-white"
										: "text-neutral-400 hover:text-neutral-200"
								}`}
								data-toc-id={heading.id}
								href={`#${heading.id}`}
								onClick={() => handleClick(heading.id)}
							>
								{heading.text}
							</a>
						</li>
					))}
				</ul>
			</div>
		</nav>
	);
};

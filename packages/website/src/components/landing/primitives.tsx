import type { ReactNode } from "react";
import { CommandBlock } from "./command-block";

export const Doc = ({ children }: { children: ReactNode }) => (
	<div className="landing bg-black font-mono font-normal text-[#e8e8e8] text-[13px] leading-relaxed">
		<div className="mx-auto max-w-[1320px] px-6">{children}</div>
	</div>
);

export const Label = ({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) => (
	<span
		className={`font-bold text-[11px] text-white/75 uppercase tracking-[0.08em] ${className}`}
	>
		{children}
	</span>
);

/** Bordered exhibit with a caption strip, the page's one container shape. */
export const Figure = ({
	caption,
	meta,
	children,
	className = "",
}: {
	caption: string;
	meta?: string;
	children: ReactNode;
	className?: string;
}) => (
	<figure
		className={`m-0 flex flex-col border border-white/30 bg-black ${className}`}
	>
		<figcaption className="flex flex-wrap justify-between gap-4 border-white/30 border-b px-4 py-2">
			<Label>{caption}</Label>
			{meta ? (
				<span className="text-[11px] text-white/70 tracking-[0.06em]">
					{meta}
				</span>
			) : null}
		</figcaption>
		{children}
	</figure>
);

/** Two compact exhibits side by side: figure, then title, then a line of copy. */
export const SectionPair = ({
	items,
}: {
	items: {
		title: string;
		copy: ReactNode;
		figure: ReactNode;
		command: string;
		docs: { href: string; label: string };
	}[];
}) => (
	<section className="grid gap-12 border-white/15 border-b py-10 lg:grid-cols-2">
		{items.map((item) => (
			<div key={item.title}>
				{item.figure}
				<h2 className="mt-5 mb-3 font-bold text-[#f2f1ef] text-xl leading-tight tracking-[-0.01em]">
					{item.title}
				</h2>
				<CommandBlock command={item.command} />
				<div className="mt-3 max-w-[52ch] text-[13px] text-white/[0.92] leading-relaxed [&_b]:text-white [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-px [&_code]:text-white">
					{item.copy}
				</div>
				<a
					className="mt-3 inline-block text-nest-red underline underline-offset-4"
					href={item.docs.href}
				>
					{item.docs.label} →
				</a>
			</div>
		))}
	</section>
);

export const Section = ({
	title,
	copy,
	figure,
	figureLeft = false,
}: {
	title: string;
	copy: ReactNode;
	figure: ReactNode;
	figureLeft?: boolean;
}) => (
	<section className="border-white/15 border-b py-10">
		<div
			className={`grid items-center gap-12 lg:grid-cols-[5fr_7fr] ${figureLeft ? "lg:grid-cols-[7fr_5fr]" : ""}`}
		>
			<div className={figureLeft ? "lg:order-2" : ""}>
				<h2 className="mt-0 mb-5 max-w-[40ch] text-balance font-bold text-2xl text-[#f2f1ef] leading-tight tracking-[-0.01em]">
					{title}
				</h2>
				<div className="space-y-4 text-[13px] text-white/[0.92] leading-relaxed [&_b]:text-white [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-px [&_code]:text-white">
					{copy}
				</div>
			</div>
			<div className={figureLeft ? "lg:order-1" : ""}>{figure}</div>
		</div>
	</section>
);

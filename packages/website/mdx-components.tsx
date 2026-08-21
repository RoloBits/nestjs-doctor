import type { MDXComponents } from "mdx/types";
import { CodeBlock } from "@/components/docs/code-block";

const ANCHOR_CLASS =
	"absolute -left-6 top-0 hidden text-neutral-600 no-underline opacity-0 transition-opacity hover:text-neutral-400 focus-visible:opacity-100 group-hover:opacity-100 lg:inline";

/**
 * A heading with a gutter link beside it. The link is a sibling rather than a
 * child, so it stays out of the heading's accessible name.
 */
const Heading = ({
	as: Tag,
	children,
	className,
	id,
	spacing,
}: {
	as: "h2" | "h3";
	children?: React.ReactNode;
	className: string;
	id?: string;
	spacing: string;
}) => (
	<div className={`group relative ${spacing}`}>
		{id ? (
			<a
				aria-label="Link to this section"
				className={ANCHOR_CLASS}
				href={`#${id}`}
			>
				#
			</a>
		) : null}
		<Tag className={`scroll-mt-20 font-medium text-white ${className}`} id={id}>
			{children}
		</Tag>
	</div>
);

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		h1: (props) => (
			<h1
				className="mb-5 scroll-mt-20 font-medium text-2xl text-white sm:text-3xl"
				{...props}
			/>
		),
		h2: ({ children, id }) => (
			<Heading
				as="h2"
				className="text-xl sm:text-2xl"
				id={id}
				spacing="mt-14 mb-4"
			>
				{children}
			</Heading>
		),
		h3: ({ children, id }) => (
			<Heading
				as="h3"
				className="text-lg sm:text-xl"
				id={id}
				spacing="mt-8 mb-3"
			>
				{children}
			</Heading>
		),
		h4: (props) => (
			<h4
				className="mt-6 mb-2 scroll-mt-20 font-medium text-white"
				{...props}
			/>
		),
		p: (props) => (
			<p className="mb-4 text-neutral-300 leading-relaxed" {...props} />
		),
		a: (props) => (
			<a
				className="text-nest-red underline decoration-nest-red/40 underline-offset-2 transition-colors hover:text-nest-red-light hover:decoration-nest-red-light"
				{...props}
			/>
		),
		code: (props) => {
			const isInline = typeof props.children === "string";
			if (isInline) {
				return (
					<code
						className="rounded-[5px] border border-white/10 bg-white/[0.07] px-[5px] py-[2px] text-[0.9em] text-white"
						{...props}
					/>
				);
			}
			return <code {...props} />;
		},
		pre: CodeBlock,
		table: (props) => (
			<div className="mb-4 overflow-x-auto rounded-xl border border-white/15">
				<table className="w-full border-collapse text-sm" {...props} />
			</div>
		),
		thead: (props) => <thead className="text-left" {...props} />,
		th: (props) => (
			<th
				className="border-white/10 border-b px-4 py-2.5 font-medium text-white text-xs uppercase tracking-wide"
				{...props}
			/>
		),
		td: (props) => (
			<td
				className="border-white/[0.07] border-b px-4 py-2.5 align-middle text-neutral-300"
				{...props}
			/>
		),
		ul: (props) => (
			<ul className="mb-4 list-disc pl-6 text-neutral-300" {...props} />
		),
		ol: (props) => (
			<ol className="mb-4 list-decimal pl-6 text-neutral-300" {...props} />
		),
		li: (props) => <li className="mb-1.5 leading-relaxed" {...props} />,
		blockquote: (props) => (
			<blockquote
				className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-neutral-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
				{...props}
			/>
		),
		hr: () => <hr className="my-10 border-white/10" />,
		strong: (props) => <strong className="font-medium text-white" {...props} />,
		...components,
	};
}

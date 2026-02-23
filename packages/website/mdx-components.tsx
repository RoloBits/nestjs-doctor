import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		h1: (props) => (
			<h1
				className="mb-6 font-medium text-2xl text-white sm:text-3xl"
				{...props}
			/>
		),
		h2: (props) => (
			<h2
				className="mt-10 mb-4 border-white/10 border-t pt-8 font-medium text-white text-xl sm:text-2xl"
				{...props}
			/>
		),
		h3: (props) => (
			<h3
				className="mt-8 mb-3 font-medium text-lg text-white sm:text-xl"
				{...props}
			/>
		),
		h4: (props) => (
			<h4 className="mt-6 mb-2 font-medium text-white" {...props} />
		),
		p: (props) => (
			<p className="mb-4 text-neutral-300 leading-relaxed" {...props} />
		),
		a: (props) => (
			<a
				className="text-nest-red underline hover:text-nest-red-light"
				{...props}
			/>
		),
		code: (props) => {
			const isInline = typeof props.children === "string";
			if (isInline) {
				return (
					<code
						className="rounded bg-white/10 px-1.5 py-0.5 text-neutral-200 text-sm"
						{...props}
					/>
				);
			}
			return <code {...props} />;
		},
		pre: (props) => (
			<pre
				className="mb-4 overflow-x-auto rounded border border-white/10 bg-[#111] p-4 text-sm leading-relaxed"
				{...props}
			/>
		),
		table: (props) => (
			<div className="mb-4 overflow-x-auto">
				<table className="w-full text-sm" {...props} />
			</div>
		),
		thead: (props) => (
			<thead className="border-white/10 border-b text-left" {...props} />
		),
		th: (props) => (
			<th className="px-3 py-2 font-medium text-white" {...props} />
		),
		td: (props) => (
			<td
				className="border-white/5 border-t px-3 py-2 text-neutral-300"
				{...props}
			/>
		),
		ul: (props) => (
			<ul className="mb-4 list-disc pl-6 text-neutral-300" {...props} />
		),
		ol: (props) => (
			<ol className="mb-4 list-decimal pl-6 text-neutral-300" {...props} />
		),
		li: (props) => <li className="mb-1 leading-relaxed" {...props} />,
		blockquote: (props) => (
			<blockquote
				className="mb-4 border-nest-red/50 border-l-2 pl-4 text-neutral-400 italic"
				{...props}
			/>
		),
		hr: () => <hr className="my-8 border-white/10" />,
		strong: (props) => <strong className="font-medium text-white" {...props} />,
		...components,
	};
}

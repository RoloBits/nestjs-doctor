import Image from "next/image";

/**
 * The landing's nav, rendered identically on every docs page. Same markup in
 * the same container on both, so crossing between them moves nothing.
 */
export const Nav = () => (
	<nav className="flex flex-wrap items-stretch justify-between gap-4 border-white/30 border-b py-2">
		<a
			className="flex items-center gap-3 font-bold text-[#f2f1ef] text-[13px] tracking-[0.08em] no-underline"
			href="/"
		>
			<Image alt="" height={20} src="/logo.png" width={20} />
			NESTJS-DOCTOR
		</a>
		<div className="flex gap-2">
			{[
				{ href: "/docs", label: "docs" },
				{ href: "https://github.com/RoloBits/nestjs-doctor", label: "github" },
			].map((link) => (
				<a
					className="inline-flex items-center border border-white/30 px-4 py-1.5 font-bold text-[11px] text-white/75 uppercase tracking-[0.08em] no-underline transition-colors hover:border-white hover:bg-white hover:text-black"
					href={link.href}
					key={link.href}
					rel={link.href.startsWith("http") ? "noreferrer" : undefined}
					target={link.href.startsWith("http") ? "_blank" : undefined}
				>
					{link.label}
				</a>
			))}
		</div>
	</nav>
);

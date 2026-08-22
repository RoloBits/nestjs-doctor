import Image from "next/image";
import Link from "next/link";

const BUTTON =
	"inline-flex items-center border border-white/30 px-4 py-1.5 font-bold text-[11px] text-white/75 uppercase tracking-[0.08em] no-underline transition-colors hover:border-white hover:bg-white hover:text-black";

/**
 * The landing's nav, rendered identically on every docs page. Same markup in
 * the same container on both, so crossing between them moves nothing.
 */
export const Nav = () => (
	<nav className="flex flex-wrap items-stretch justify-between gap-4 border-white/30 border-b py-2">
		<Link
			className="flex items-center gap-3 font-bold text-[#f2f1ef] text-[13px] tracking-[0.08em] no-underline"
			href="/"
		>
			<Image alt="" height={20} src="/logo.png" width={20} />
			NESTJS-DOCTOR
		</Link>
		<div className="flex gap-2">
			<Link className={BUTTON} href="/docs">
				docs
			</Link>
			<a
				className={BUTTON}
				href="https://github.com/RoloBits/nestjs-doctor"
				rel="noreferrer"
				target="_blank"
			>
				github
			</a>
		</div>
	</nav>
);

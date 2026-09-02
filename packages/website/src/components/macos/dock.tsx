const DOCK_CLASS =
	"flex items-end gap-2 rounded-xl border border-white/30 bg-white/20 p-2 shadow-xl backdrop-blur-xl";
const THUMBNAIL_CLASS =
	"flex h-12 w-16 flex-col overflow-hidden rounded-md border border-white/15 bg-[#0a0a0a] shadow-md";
const TOOLTIP_CLASS =
	"-top-8 -translate-x-1/2 absolute left-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100";

/** The minimised window, parked at the bottom of the desktop. */
export const Dock = ({
	onRestore,
	title,
}: {
	onRestore: () => void;
	title: string;
}) => (
	<div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
		<div className={DOCK_CLASS}>
			<button
				className="group relative cursor-pointer p-0 transition-transform hover:scale-105"
				data-cuelume-press="press"
				data-cuelume-release="release"
				onClick={onRestore}
				type="button"
			>
				<div className={THUMBNAIL_CLASS}>
					<div className="flex items-center gap-1 bg-[#2a2a2c] px-1.5 py-0.5">
						<span className="h-1 w-1 rounded-full bg-[#FF5F57]" />
						<span className="h-1 w-1 rounded-full bg-[#FFBD2E]" />
						<span className="h-1 w-1 rounded-full bg-[#28CA41]" />
					</div>
					<div className="flex flex-1 flex-col items-center justify-center gap-0.5 p-1">
						<span className="h-1 w-4 rounded-sm bg-white/40" />
						<span className="h-0.5 w-6 rounded-sm bg-white/20" />
						<span className="h-0.5 w-5 rounded-sm bg-white/20" />
					</div>
				</div>

				<span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/60" />

				<span className={TOOLTIP_CLASS}>{title}</span>
			</button>
		</div>
	</div>
);

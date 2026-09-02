/** The macOS desert-stripe wallpaper, as flat SVG paths. */
const GRADIENT_ID = "leaderboard-sky";

export const MacOSWallpaper = ({ className }: { className?: string }) => (
	<svg
		aria-hidden="true"
		className={className}
		preserveAspectRatio="xMidYMid slice"
		viewBox="0 0 1000 600"
	>
		<defs>
			<linearGradient id={GRADIENT_ID} x1="0%" x2="0%" y1="0%" y2="100%">
				<stop offset="0%" stopColor="#c9e4f6" />
				<stop offset="100%" stopColor="#e6f0f7" />
			</linearGradient>
		</defs>
		<rect fill={`url(#${GRADIENT_ID})`} height="100%" width="100%" />
		<path
			d="M0,180 Q150,120 350,160 T700,140 T1000,170 V600 H0 Z"
			fill="#a8d4e6"
		/>
		<path
			d="M0,220 Q200,170 400,210 T750,190 T1000,220 V600 H0 Z"
			fill="#8ec4d6"
		/>
		<path
			d="M0,280 Q180,230 380,260 T720,240 T1000,270 V600 H0 Z"
			fill="#7cb5aa"
		/>
		<path
			d="M0,330 Q220,290 420,320 T780,300 T1000,330 V600 H0 Z"
			fill="#9cc98e"
		/>
		<path
			d="M0,380 Q160,340 360,370 T700,350 T1000,380 V600 H0 Z"
			fill="#e8d17d"
		/>
		<path
			d="M0,430 Q200,400 400,420 T750,400 T1000,430 V600 H0 Z"
			fill="#df9255"
		/>
		<path
			d="M0,480 Q180,450 380,470 T720,455 T1000,480 V600 H0 Z"
			fill="#d97046"
		/>
		<path
			d="M0,530 Q220,500 420,520 T780,505 T1000,530 V600 H0 Z"
			fill="#c65d3b"
		/>
	</svg>
);

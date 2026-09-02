import { bind, play as cuelume, type SoundName, setEnabled } from "cuelume";

export type Cue =
	| SoundName
	| "open"
	| "maximize"
	| "unmaximize"
	| "minimize"
	| "close";

const STORAGE_KEY = "nestjs-doctor:sounds";
const SILENT = 0.0001;

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let enabled: boolean | null = null;
const listeners = new Set<() => void>();

/** The stored preference; unknown or unreadable storage counts as on. */
export const soundsEnabled = (): boolean => {
	if (enabled === null) {
		try {
			enabled = localStorage.getItem(STORAGE_KEY) !== "off";
		} catch {
			enabled = true;
		}
	}
	return enabled;
};

/** Wires the data-cuelume attributes once and applies the stored preference. */
export const bindSounds = () => {
	bind();
	setEnabled(soundsEnabled());
};

export const subscribeSounds = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const setSoundsEnabled = (on: boolean) => {
	enabled = on;
	setEnabled(on);
	for (const listener of listeners) {
		listener();
	}
	try {
		localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
	} catch {
		// Storage is unavailable; the choice lasts for this page.
	}
};

const audio = (): AudioContext => {
	if (!context) {
		context = new AudioContext();
	}
	if (context.state !== "running") {
		context.resume().catch(() => undefined);
	}
	return context;
};

const noiseBuffer = (c: AudioContext): AudioBuffer => {
	if (!noise) {
		noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = Math.random() * 2 - 1;
		}
	}
	return noise;
};

const envelope = (
	c: AudioContext,
	peak: number,
	attack: number,
	ms: number
) => {
	const gain = c.createGain();
	const t = c.currentTime;
	gain.gain.setValueAtTime(SILENT, t);
	gain.gain.exponentialRampToValueAtTime(peak, t + attack / 1000);
	gain.gain.exponentialRampToValueAtTime(SILENT, t + ms / 1000);
	gain.connect(c.destination);
	return gain;
};

/** Band-passed air sweeping from one frequency to another. */
const whoosh = (
	c: AudioContext,
	from: number,
	to: number,
	ms: number,
	peak: number
) => {
	const source = c.createBufferSource();
	source.buffer = noiseBuffer(c);
	const filter = c.createBiquadFilter();
	filter.type = "bandpass";
	filter.Q.value = 1.4;
	filter.frequency.setValueAtTime(from, c.currentTime);
	filter.frequency.exponentialRampToValueAtTime(to, c.currentTime + ms / 1000);
	source.connect(filter);
	filter.connect(envelope(c, peak, ms / 4, ms));
	source.start();
	source.stop(c.currentTime + ms / 1000);
};

/** A short, low, pitch-dropping sine: a key bottoming out. */
const thock = (
	c: AudioContext,
	from: number,
	to: number,
	ms: number,
	peak: number
) => {
	const osc = c.createOscillator();
	osc.frequency.setValueAtTime(from, c.currentTime);
	osc.frequency.exponentialRampToValueAtTime(to, c.currentTime + ms / 1000);
	osc.connect(envelope(c, peak, 3, ms));
	osc.start();
	osc.stop(c.currentTime + ms / 1000);
};

const WINDOW_CUES: Record<
	Exclude<Cue, SoundName>,
	(c: AudioContext) => void
> = {
	open: (c) => whoosh(c, 320, 1900, 230, 0.6),
	maximize: (c) => whoosh(c, 600, 2600, 90, 0.5),
	unmaximize: (c) => whoosh(c, 2600, 600, 90, 0.5),
	minimize: (c) => whoosh(c, 1900, 280, 260, 0.45),
	close: (c) => {
		whoosh(c, 1300, 140, 210, 0.5);
		thock(c, 120, 45, 70, 0.18);
	},
};

const isWindowCue = (cue: Cue): cue is keyof typeof WINDOW_CUES =>
	cue in WINDOW_CUES;

/** Plays one cue now; a silent no-op without Web Audio or when muted. */
export const play = (cue: Cue) => {
	if (typeof window === "undefined" || !soundsEnabled()) {
		return;
	}
	if (!isWindowCue(cue)) {
		cuelume(cue);
		return;
	}
	if (!("AudioContext" in window)) {
		return;
	}
	try {
		WINDOW_CUES[cue](audio());
	} catch {
		// Autoplay was refused; the action still happens.
	}
};

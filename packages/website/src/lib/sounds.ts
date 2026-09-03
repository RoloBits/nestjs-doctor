import {
	bind,
	play as cuelume,
	type SoundName,
	setEnabled,
	setVolume,
} from "cuelume";

export type Cue =
	| SoundName
	| "open"
	| "maximize"
	| "unmaximize"
	| "minimize"
	| "close";

const STORAGE_KEY = "nestjs-doctor:sounds";
const VOLUME_KEY = "nestjs-doctor:volume";
const DEFAULT_VOLUME = 1 / 3;
const SILENT = 0.0001;

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let enabled: boolean | null = null;
let volume: number | null = null;
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

const clamp = (value: number): number =>
	Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME;

/** The stored master volume from 0 to 1; unknown or unreadable storage is the default. */
export const soundsVolume = (): number => {
	if (volume === null) {
		try {
			const stored = localStorage.getItem(VOLUME_KEY);
			volume = stored === null ? DEFAULT_VOLUME : clamp(Number(stored));
		} catch {
			volume = DEFAULT_VOLUME;
		}
	}
	return volume;
};

/** Wires the data-cuelume attributes once and applies the stored preferences. */
export const bindSounds = () => {
	bind();
	setEnabled(soundsEnabled());
	setVolume(soundsVolume());
};

export const subscribeSounds = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const notify = () => {
	for (const listener of listeners) {
		listener();
	}
};

const persist = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage is unavailable; the choice lasts for this page.
	}
};

export const setSoundsEnabled = (on: boolean) => {
	enabled = on;
	setEnabled(on);
	notify();
	persist(STORAGE_KEY, on ? "on" : "off");
};

export const setSoundsVolume = (value: number) => {
	volume = clamp(value);
	setVolume(volume);
	notify();
	persist(VOLUME_KEY, String(volume));
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
	gain.gain.exponentialRampToValueAtTime(
		Math.max(peak * soundsVolume(), SILENT),
		t + attack / 1000
	);
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

/** A noise tick over a short damped sine body: a switch snapping. */
const click = (c: AudioContext, tick: number, body: number, ms: number) => {
	whoosh(c, tick, tick * 0.6, 12, 0.45);
	thock(c, body, body * 0.65, ms, 0.3);
};

const WINDOW_CUES: Record<
	Exclude<Cue, SoundName>,
	(c: AudioContext) => void
> = {
	open: (c) => click(c, 2200, 800, 45),
	maximize: (c) => whoosh(c, 3400, 2000, 12, 0.5),
	unmaximize: (c) => click(c, 3000, 1100, 40),
	minimize: (c) => click(c, 1600, 520, 55),
	close: (c) => {
		click(c, 1300, 400, 60);
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

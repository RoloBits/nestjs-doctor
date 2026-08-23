"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import posthog from "posthog-js";
import { useEffect } from "react";

// Any browser with this localStorage key set reports nothing:
// localStorage.setItem("nd-analytics-opt-out", "1")
const OPT_OUT_KEY = "nd-analytics-opt-out";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
	process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_UI_HOST = "https://us.posthog.com";

const optedOut = (): boolean => {
	try {
		return localStorage.getItem(OPT_OUT_KEY) !== null;
	} catch {
		return false;
	}
};

export function SiteAnalytics() {
	useEffect(() => {
		if (!POSTHOG_KEY || optedOut() || posthog.__loaded) {
			return;
		}
		posthog.init(POSTHOG_KEY, {
			api_host: POSTHOG_HOST,
			ui_host: POSTHOG_UI_HOST,
			autocapture: true,
			capture_pageview: "history_change",
			capture_pageleave: true,
			capture_heatmaps: true,
			disable_session_recording: true,
			disable_surveys: true,
			person_profiles: "identified_only",
		});
	}, []);

	return (
		<>
			<Analytics beforeSend={(event) => (optedOut() ? null : event)} />
			<SpeedInsights beforeSend={(event) => (optedOut() ? null : event)} />
		</>
	);
}

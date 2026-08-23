"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Any browser with this localStorage key set reports nothing:
// localStorage.setItem("nd-analytics-opt-out", "1")
const OPT_OUT_KEY = "nd-analytics-opt-out";

const optedOut = (): boolean => {
	try {
		return localStorage.getItem(OPT_OUT_KEY) !== null;
	} catch {
		return false;
	}
};

export function SiteAnalytics() {
	return (
		<>
			<Analytics beforeSend={(event) => (optedOut() ? null : event)} />
			<SpeedInsights beforeSend={(event) => (optedOut() ? null : event)} />
		</>
	);
}

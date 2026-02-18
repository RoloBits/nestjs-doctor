import type { Category, Severity } from "../types/diagnostic.js";

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
	error: 3.0,
	warning: 1.5,
	info: 0.5,
};

export const CATEGORY_MULTIPLIERS: Record<Category, number> = {
	security: 1.5,
	correctness: 1.3,
	architecture: 1.0,
	performance: 0.8,
};

export const ruleOne = {
	meta: {
		id: "rule-one",
		category: "security",
		severity: "error",
		description: "First rule",
		help: "Help for rule one.",
	},
	check(context) {},
};

export const ruleTwo = {
	meta: {
		id: "rule-two",
		category: "performance",
		severity: "info",
		description: "Second rule",
		help: "Help for rule two.",
	},
	check(context) {},
};

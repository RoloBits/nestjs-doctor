// Generated from the shipped Rule Lab presets; code strings are exact.
export interface LabPreset {
	category: string;
	code: string;
	description: string;
	ruleId: string;
	scope: string;
	severity: string;
}

export const PLAYGROUND_PRESETS: Record<string, LabPreset> = {
	todo: {
		ruleId: "no-todo-comments",
		category: "correctness",
		severity: "warning",
		scope: "file",
		description: "Flags TODO comments left in source code",
		code: '// Find TODO/FIXME comments...\nconst lines = context.fileText.split("\\n");\nfor (let i = 0; i < lines.length; i++) {\n  if (/\\/\\/\\s*(TODO|FIXME)/.test(lines[i])) {\n    context.report({\n      message: "Found TODO/FIXME comment: " + lines[i].trim(),\n      line: i + 1,\n    });\n  }\n}',
	},
	"console-log": {
		ruleId: "no-console-log",
		category: "correctness",
		severity: "warning",
		scope: "file",
		description: "Flags console.log statements left in source code",
		code: '// Find console.log() calls...\nconst lines = context.fileText.split("\\n");\nfor (let i = 0; i < lines.length; i++) {\n  if (/console\\.(log|debug|warn|error)\\s*\\(/.test(lines[i])) {\n    const match = lines[i].match(/console\\.(log|debug|warn|error)/);\n    context.report({\n      message: "Found console." + match[1] + "() call",\n      line: i + 1,\n    });\n  }\n}',
	},
	"large-file": {
		ruleId: "no-large-files",
		category: "architecture",
		severity: "info",
		scope: "file",
		description: "Flags files exceeding 300 lines",
		code: '// Flag files that are too long\nconst lines = context.fileText.split("\\n");\nconst MAX_LINES = 300;\nif (lines.length > MAX_LINES) {\n  context.report({\n    message: "File has " + lines.length + " lines (max " + MAX_LINES + ")",\n    line: 1,\n  });\n}',
	},
	"orphan-modules": {
		ruleId: "find-orphan-modules",
		category: "architecture",
		severity: "info",
		scope: "project",
		description: "Finds modules never imported by another module",
		code: '// Find modules that are never imported...\nvar imported = new Set();\nfor (var i = 0; i < context.modules.length; i++) {\n  var mod = context.modules[i];\n  for (var j = 0; j < mod.imports.length; j++) {\n    imported.add(mod.imports[j]);\n  }\n}\nfor (var i = 0; i < context.modules.length; i++) {\n  var mod = context.modules[i];\n  if (mod.name !== "AppModule" && !imported.has(mod.name)) {\n    context.report({\n      message: "Module \'" + mod.name + "\' is never imported",\n      filePath: mod.filePath,\n      line: 1,\n    });\n  }\n}',
	},
	"unused-providers": {
		ruleId: "find-unused-providers",
		category: "performance",
		severity: "warning",
		scope: "project",
		description: "Finds providers never injected anywhere",
		code: '// Find providers not used as dependencies...\nvar allDeps = new Set();\nfor (var i = 0; i < context.providers.length; i++) {\n  var p = context.providers[i];\n  for (var j = 0; j < p.dependencies.length; j++) {\n    allDeps.add(p.dependencies[j]);\n  }\n}\nfor (var i = 0; i < context.providers.length; i++) {\n  var p = context.providers[i];\n  if (!allDeps.has(p.name)) {\n    context.report({\n      message: "Provider \'" + p.name + "\' is never injected",\n      filePath: p.filePath,\n      line: 1,\n    });\n  }\n}',
	},
};

export const LAB_INITIAL_CODE =
	'// context.fileText  — full source code (string)\n// context.filePath  — file path (string)\n// context.report({ message, line })  — report a finding\n\nconst lines = context.fileText.split("\n");\nfor (let i = 0; i < lines.length; i++) {\n  if (lines[i].includes("TODO")) {\n    context.report({\n      message: "Found TODO comment",\n      line: i + 1,\n    });\n  }\n}';

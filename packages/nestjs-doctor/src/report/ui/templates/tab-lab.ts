import { textButton } from "../atoms/button.js";
import { emptyState } from "../molecules/empty-state.js";
import { selectField } from "../molecules/select-field.js";
import { textField } from "../molecules/text-field.js";

export const TAB_LAB = `
<!-- ── Tab: Lab ── -->
<div class="tab-content" id="tab-lab">
  <div class="playground-editor">
    <div class="playground-section-label playground-title">RULE LAB</div>
    <p class="playground-subtitle">Write and test <a href="https://www.nestjs.doctor/docs/rules/custom" target="_blank" rel="noopener">custom rules</a> against your project. Use <code>/nestjs-doctor-create-rule</code> with an AI agent to <a href="https://www.nestjs.doctor/docs/coding-agents" target="_blank" rel="noopener">scaffold rules automatically</a>.</p>
    <div class="playground-form">
      <div class="playground-form-row">
${textField({ id: "pg-rule-id", label: "Rule ID", value: "my-rule" })}
${selectField({
	id: "pg-category",
	label: "Category",
	options: [
		{ value: "correctness", label: "correctness", selected: true },
		{ value: "security", label: "security" },
		{ value: "performance", label: "performance" },
		{ value: "architecture", label: "architecture" },
	],
})}
${selectField({
	id: "pg-severity",
	label: "Severity",
	options: [
		{ value: "warning", label: "warning", selected: true },
		{ value: "error", label: "error" },
		{ value: "info", label: "info" },
	],
})}
      </div>
      <div class="playground-form-row">
${textField({ id: "pg-description", label: "Description", placeholder: "What does this rule check?", wide: true })}
      </div>
    </div>
    <div class="playground-preset">
${selectField({
	id: "pg-scope",
	label: "Scope",
	indent: 6,
	options: [
		{ value: "file", label: "File rule", selected: true },
		{ value: "project", label: "Project rule" },
	],
})}
      <div class="playground-preset-sep"></div>
${selectField({
	id: "pg-preset",
	label: "Load example",
	wide: true,
	indent: 6,
	groups: [
		{
			label: "File rules",
			options: [
				{ value: "todo", label: "Find TODO comments" },
				{ value: "console-log", label: "Find console.log statements" },
				{ value: "large-file", label: "Detect large files" },
			],
		},
		{
			label: "Project rules",
			options: [
				{ value: "orphan-modules", label: "Find orphan modules" },
				{ value: "unused-providers", label: "Find unused providers" },
			],
		},
	],
})}
    </div>
    <div class="playground-section-label">CHECK FUNCTION</div>
    <div id="pg-cm-editor" class="pg-cm-wrap"></div>
    <div id="pg-context-hint" class="pg-context-hint">context.fileText · context.filePath · context.report({ message, line })</div>
    <script id="pg-code-init" type="text/plain">// context.fileText  — full source code (string)
// context.filePath  — file path (string)
// context.report({ message, line })  — report a finding

const lines = context.fileText.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("TODO")) {
    context.report({
      message: "Found TODO comment",
      line: i + 1,
    });
  }
}</script>
    <div class="playground-actions">
${textButton({ id: "pg-run-btn", label: "&#9654; Run Rule" })}
    </div>
    <div id="pg-error" class="playground-error" style="display:none"></div>
  </div>
  <div class="playground-results">
    <div class="playground-section-label">RESULTS <span id="pg-result-count"></span></div>
    <div id="pg-file-view" style="display:none">
      <div id="pg-file-header"></div>
      <div id="pg-file-code" class="playground-code-body"></div>
    </div>
    <div id="pg-result-list"></div>
${emptyState({ id: "pg-result-empty", classes: "playground-empty", icon: { name: "pencil", size: 40 }, text: "Write a check function and click Run" })}
  </div>
</div>
`;

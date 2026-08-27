import { tabButton } from "../components/tab-button.js";

export const TAB_BAR = `
<!-- ── Header Row 2 (Tab bar) ── -->
<div id="header-row2">
${tabButton({ tab: "summary", label: "Summary", paths: `<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`, active: true })}
${tabButton({ tab: "diagnosis", label: "Findings ", paths: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`, after: `<span class="count-badge" id="diagnosis-count-badge"></span>` })}
${tabButton({ tab: "modules", label: "Modules Graph", paths: `<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>` })}
${tabButton({ tab: "endpoints", label: "Endpoints ", paths: `<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>`, id: "tab-btn-endpoints", hidden: true, after: `<span class="beta-badge">Beta</span>` })}
${tabButton({ tab: "schema", label: "Relational Schema", paths: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>`, id: "tab-btn-schema", hidden: true })}
${tabButton({ tab: "lab", label: "Rule Lab", paths: `<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>` })}
  <div class="tab-spacer"></div>
</div>
`;

export const BOOT = `
REPORT_APP.renderChrome(REPORT);
REPORT_APP.renderLab(REPORT);
REPORT_APP.registerModelContext(REPORT);
switchTab("summary");
`;

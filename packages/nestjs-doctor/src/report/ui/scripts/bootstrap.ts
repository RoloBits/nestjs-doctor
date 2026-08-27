export const bootstrap = (artifactJson: string): string => `
const REPORT = ${artifactJson};
const graph = REPORT.graph;
const project = Object.assign({}, REPORT.project, { score: REPORT.score });
const diagnostics = REPORT.diagnostics;
const sourceLinesData = [];
for (let i = 0; i < diagnostics.length; i++) {
  const sl = diagnostics[i].sourceLines;
  sourceLinesData.push(sl && sl.length > 0 ? sl : null);
}
const summary = REPORT.summary;
const elapsedMs = REPORT.elapsedMs;
const ruleExamples = REPORT.examples;
const fileSources = REPORT.sources;
const providers = REPORT.providers;
const schema = REPORT.schema;
const endpoints = REPORT.endpoints;
const isMonorepo = REPORT.monorepo;

graph.bootstrapRoots = graph.bootstrapRoots || [];
graph.timingsTrace = graph.timingsTrace || {};
`;

export {
  FIX_SUGGESTION_MARKER,
  parseChangedLines,
  planFixSuggestions,
  renderSuggestion,
  renderSuggestionReview,
  selectChangedAnnotations,
  suggestionComment,
  suggestionsFromPatch,
} from "./github-action/diff.js";
export { highestSeverity, nextEndOfLife, renderFindingsJson } from "./github-action/outputs.js";
export { parsePathsInput, resolveScanPaths } from "./github-action/inputs.js";
export { ATTRIBUTION_LINE, PR_COMMENT_MARKER, renderBadge, renderComment, renderFailure, renderSummary } from "./github-action/render.js";
export { runGitHubAction } from "./github-action/run.js";
export type {
  AnnotationLevel,
  GitHubActionOptions,
  GitHubActionOutcome,
  GitHubAnnotation,
  SeverityGate,
  SuggestionComment,
  UnannotatedFindings,
} from "./github-action/types.js";

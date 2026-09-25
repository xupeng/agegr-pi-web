/**
 * Pi Web server-side alias for the portable tool factory.
 *
 * The tool definition and TypeBox schema live in the portable package so the
 * local Pi extension and Pi Web stay in lockstep. Pi Web injects `open`
 * directly (its inline adapter owns settings, session lookup, persistence and
 * follow-up delivery) rather than resolving the package's host bridge.
 */

export {
  createAskUserToolDefinition,
  type AskUserInvocation,
  type AskUserToolDeps,
} from "./portable/tool";

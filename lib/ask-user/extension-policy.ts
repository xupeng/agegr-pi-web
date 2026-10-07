import type { Extension, LoadExtensionsResult, RegisteredTool } from "@earendil-works/pi-coding-agent";
import { samePath } from "../paths";

export type ExtensionToolTransform = (extension: Extension, tool: RegisteredTool) => RegisteredTool | undefined;

export interface AskUserToolProjection {
  /** Returns the tool to keep, or undefined to withdraw it from the runner-visible Map. */
  transform: ExtensionToolTransform;
  /** Diagnostics for an `ask_user` discovered in more than one source. */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Decide what `ask_user` becomes per extension. `projectAskUserTools` still copies, because its
 * callers rely on the input staying untouched; the registration-aware child projection needs a
 * transform it can apply to the live tool Map a factory closure already holds.
 */
export function createAskUserToolProjection(
  base: LoadExtensionsResult,
  mainSession = true,
): AskUserToolProjection {
  const owners = base.extensions.filter((extension) => extension.tools.has("ask_user"));
  const sources = owners.filter((owner, index) => !owners.slice(0, index).some((previous) =>
    samePath(previous.resolvedPath, owner.resolvedPath)));
  const denyAll = !mainSession || sources.length > 1;
  return {
    transform: (extension, tool) => {
      if (tool.definition.name !== "ask_user") return tool;
      if (denyAll || extension !== owners[0]) return undefined;
      if (tool.definition.exposure === "hidden") return tool;
      // hidden remains withdrawn. defaultActive:false remains false. Tools
      // previously nondeclarable must not become active merely by projection.
      const originallyInactive = tool.definition.exposure === "codemode"
        || tool.definition.exposure === "deferred";
      return {
        ...tool,
        definition: {
          ...tool.definition,
          exposure: "model-only",
          ...(originallyInactive ? { defaultActive: false } : {}),
        },
      };
    },
    errors: sources.length > 1
      ? [{
          path: "<inline:pi-web-ask-user-host>",
          error: `ask_user: ambiguous discovered sources; tool withdrawn: ${sources.map((owner) => owner.resolvedPath).join(", ")}`,
        }]
      : [],
  };
}

/** Only tool Maps are projected. Factories have already run: this is not a sandbox. */
export function projectAskUserTools(base: LoadExtensionsResult, mainSession = true): LoadExtensionsResult {
  if (!base.extensions.some((extension) => extension.tools.has("ask_user"))) return base;
  const { transform, errors } = createAskUserToolProjection(base, mainSession);
  return {
    ...base,
    extensions: base.extensions.map((extension) => {
      let tools: Map<string, RegisteredTool> | undefined;
      for (const [name, tool] of extension.tools) {
        const transformed = transform(extension, tool);
        if (transformed === tool) continue;
        if (tools === undefined) tools = new Map(extension.tools);
        if (transformed === undefined) tools.delete(name);
        else tools.set(name, transformed);
      }
      return tools === undefined ? extension : { ...extension, tools };
    }),
    ...(errors.length > 0 ? { errors: [...base.errors, ...errors] } : {}),
  };
}

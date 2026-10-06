import type { LoadExtensionsResult } from "@earendil-works/pi-coding-agent";
import { samePath } from "../paths";

/** Only tool Maps are projected. Factories have already run: this is not a sandbox. */
export function projectAskUserTools(base: LoadExtensionsResult, mainSession = true): LoadExtensionsResult {
  const owners = base.extensions.filter((extension) => extension.tools.has("ask_user"));
  if (owners.length === 0) return base;
  const sources = owners.filter((owner, index) => !owners.slice(0, index).some((previous) =>
    samePath(previous.resolvedPath, owner.resolvedPath)));
  const conflict = sources.length > 1;
  const deny = !mainSession || conflict;
  return {
    ...base,
    extensions: base.extensions.map((extension) => {
      const tool = extension.tools.get("ask_user");
      if (!tool) return extension;
      const tools = new Map(extension.tools);
      if (deny || extension !== owners[0]) tools.delete("ask_user");
      else if (tool.definition.exposure !== "hidden") {
        // hidden remains withdrawn. defaultActive:false remains false. Tools
        // previously nondeclarable must not become active merely by projection.
        const originallyInactive = tool.definition.exposure === "codemode"
          || tool.definition.exposure === "deferred";
        tools.set("ask_user", {
          ...tool,
          definition: {
            ...tool.definition,
            exposure: "model-only",
            ...(originallyInactive ? { defaultActive: false } : {}),
          },
        });
      }
      return { ...extension, tools };
    }),
    ...(conflict ? {
      errors: [...base.errors, {
        path: "<inline:pi-web-ask-user-host>",
        error: `ask_user: ambiguous discovered sources; tool withdrawn: ${sources.map((owner) => owner.resolvedPath).join(", ")}`,
      }],
    } : {}),
  };
}

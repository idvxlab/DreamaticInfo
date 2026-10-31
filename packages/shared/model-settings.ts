import { roles, type Models } from "./types";
/** Resolve inheritance once for the runtime and the settings preview. */
export function resolveModels(values: Record<string, string>): Models {
  const get = (key: string) => values[key] || "";
  return Object.fromEntries(
    roles.map((role) => {
      const suffix = role.toUpperCase(),
        provider = get(`DREAMATIC_PROVIDER_${suffix}`),
        base = get(`DREAMATIC_BASE_URL_${suffix}`);
      const custom =
        !!base || (!provider && get("DREAMATIC_PROVIDER_TYPE") !== "native");
      return [
        role,
        {
          provider: custom
            ? `dreamatic-info-${role}`
            : provider || get("DREAMATIC_PROVIDER"),
          model: get(`DREAMATIC_MODEL_${suffix}`) || get("DREAMATIC_MODEL"),
          thinkingLevel:
            get(`DREAMATIC_THINKING_LEVEL_${suffix}`) ||
            get("DREAMATIC_THINKING_LEVEL"),
        },
      ];
    }),
  ) as Models;
}

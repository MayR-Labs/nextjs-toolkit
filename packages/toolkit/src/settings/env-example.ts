import type { SettingsRegistry } from "./define";
import { settingEnvName } from "./define";

/** Renders the settings section of `.env.example` from the registry, grouped and commented. */
export function envExample(registry: SettingsRegistry): string {
  const groups = new Map<string, string[]>();
  for (const [key, def] of Object.entries(registry)) {
    const lines = groups.get(def.group) ?? [];
    lines.push(`# ${def.label}${def.help ? ` — ${def.help}` : ""}`);
    if (def.options?.length)
      lines.push(`# Options: ${def.options.map((o) => o.value).join(" | ")}`);
    const value =
      typeof def.default === "string"
        ? def.default
        : Array.isArray(def.default)
          ? def.default.join(",")
          : JSON.stringify(def.default);
    lines.push(`# ${settingEnvName(key)}=${value}`, "");
    groups.set(def.group, lines);
  }
  return [...groups.entries()]
    .map(([group, lines]) => `# ── ${group}\n${lines.join("\n")}`)
    .join("\n");
}

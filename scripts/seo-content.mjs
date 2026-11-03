import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function buildSeoContent({ brand, paths }) {
  if (paths.isDefault) return null;
  const config = JSON.parse(await readFile(join(paths.brandDir, "seo.json"), "utf8"));
  if (typeof config.allowTrainingBots !== "boolean") throw new Error("seo.allowTrainingBots must be boolean");
  const base = brand.domain.site.replace(/\/+$/, "");
  return { robotsTxt() {
    const search = ["Googlebot", "YandexBot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Claude-User"];
    const training = ["GPTBot", "ClaudeBot", "Google-Extended"];
    return [...search.map(bot => `User-agent: ${bot}\nAllow: /\n`),
      ...training.map(bot => `User-agent: ${bot}\n${config.allowTrainingBots ? "Allow: /" : "Disallow: /"}\n`),
      "User-agent: *\nAllow: /\n", `Sitemap: ${base}/sitemap.xml\n`,
      `Content-Signal: ai-train=${config.allowTrainingBots ? "yes" : "no"}, search=yes, ai-input=yes\n`].join("\n");
  } };
}

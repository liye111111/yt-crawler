import { writeFile } from "node:fs/promises";

const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CF_WORKER_NAME",
  "CF_D1_DATABASE_NAME",
  "CF_D1_DATABASE_ID",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing required .env values: ${missing.join(", ")}`);
  process.exit(1);
}

const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: process.env.CF_WORKER_NAME,
  main: "./worker/index.ts",
  compatibility_date: "2026-05-22",
  compatibility_flags: ["nodejs_compat"],
  assets: {
    directory: "dist/client",
    not_found_handling: "none",
    binding: "ASSETS",
  },
  images: { binding: "IMAGES" },
  vars: {
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash",
    GEMINI_SEARCH_GROUNDING: process.env.GEMINI_SEARCH_GROUNDING?.trim() || "false",
    GEMINI_DEBUG_LOG: process.env.GEMINI_DEBUG_LOG?.trim() || "false",
    CF_AI_GATEWAY_ACCOUNT_ID: process.env.CF_AI_GATEWAY_ACCOUNT_ID?.trim() || process.env.CLOUDFLARE_ACCOUNT_ID,
    CF_AI_GATEWAY_ID: process.env.CF_AI_GATEWAY_ID?.trim() || "",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: process.env.CF_D1_DATABASE_NAME,
      database_id: process.env.CF_D1_DATABASE_ID,
      migrations_dir: "drizzle",
    },
  ],
  observability: { enabled: true },
};

await writeFile("wrangler.jsonc", `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Generated wrangler.jsonc for ${config.name} with D1 binding DB.`);

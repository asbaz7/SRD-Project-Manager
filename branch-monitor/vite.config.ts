import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { readFileSync } from "node:fs";

// Publishable browser configuration only. Never add a service-role key here.
const { vars } = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));

export default defineConfig({
  define: Object.fromEntries(Object.entries(vars).filter(([key]) => key.startsWith('NEXT_PUBLIC_')).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});

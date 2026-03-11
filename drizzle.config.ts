// Load .env.local so DATABASE_URL is available when drizzle-kit runs outside Next.js
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not present — DATABASE_URL must be set in environment
}

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

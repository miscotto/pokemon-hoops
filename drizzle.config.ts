try {
  process.loadEnvFile(".env");
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

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// HTTP-based Drizzle client for use in Next.js Server Components.
// The Pool-based `db` uses WebSockets which aren't available outside API routes.
const http = neon(process.env.DATABASE_URL!);
export const dbHttp = drizzle(http, { schema });

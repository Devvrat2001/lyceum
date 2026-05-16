import { defineConfig } from "@prisma/config";

// Load .env.local then .env into process.env. Prisma 7 doesn't auto-load
// .env.local; we want it to win over .env in dev.
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local", override: true });
loadDotenv({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required (.env or .env.local)");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

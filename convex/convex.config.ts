import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    STUDIO_SERVER_KEY: v.optional(v.string()),
    STUDIO_MIGRATION_KEY: v.optional(v.string()),
  },
});

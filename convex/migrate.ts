import { ConvexError, v } from "convex/values";
import { env, mutation } from "./_generated/server";
import { user, session, attempt, booking, webhookEvent } from "./schema";

export const importSqlite = mutation({
  args: {
    migration_key: v.string(), digest: v.string(),
    users: v.array(user), sessions: v.array(session), attempts: v.array(attempt),
    bookings: v.array(booking), webhook_events: v.array(webhookEvent),
  },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, args) => {
    if (!env.STUDIO_MIGRATION_KEY || env.STUDIO_MIGRATION_KEY.length < 32 ||
        args.migration_key !== env.STUDIO_MIGRATION_KEY) throw new ConvexError("Unauthorized");
    const previous = await ctx.db.query("migrations")
      .withIndex("by_digest", q => q.eq("digest", args.digest)).unique();
    if (previous) return previous.counts;
    // One atomic, small-database cutover. Never merge into a live database or
    // silently overwrite data. For larger sources use a dedicated batched plan.
    for (const table of ["users", "sessions", "attempts", "bookings", "webhook_events"] as const) {
      if (await ctx.db.query(table).first()) throw new ConvexError("Migration requires an empty target.");
    }
    const unique = (values: string[]) => new Set(values).size === values.length;
    const users = new Set(args.users.map(row => row.id));
    const occupied = args.bookings.filter(row => ["demo", "held", "pending", "confirmed"].includes(row.status));
    if (!unique(args.users.map(row => row.id)) || !unique(args.users.map(row => row.email)) ||
        !unique(args.sessions.map(row => row.token_hash)) || !unique(args.bookings.map(row => row.id)) ||
        !unique(args.webhook_events.map(row => row.id)) || !unique(occupied.map(row => row.starts_at)) ||
        !unique(args.bookings.flatMap(row => row.order_id ? [row.order_id] : [])) ||
        !unique(args.bookings.flatMap(row => row.payment_id ? [row.payment_id] : [])) ||
        args.sessions.some(row => row.user_id !== null && !users.has(row.user_id)) ||
        args.bookings.some(row => !users.has(row.user_id)))
      throw new ConvexError("Source integrity check failed.");
    const counts: Record<string, number> = {};
    for (const table of ["users", "sessions", "attempts", "bookings", "webhook_events"] as const) {
      counts[table] = args[table].length;
      // Keep each table's insert typed; arrays are validated before any writes.
    }
    for (const row of args.users) await ctx.db.insert("users", row);
    for (const row of args.sessions) await ctx.db.insert("sessions", row);
    for (const row of args.attempts) await ctx.db.insert("attempts", row);
    for (const row of args.bookings) await ctx.db.insert("bookings", row);
    for (const row of args.webhook_events) await ctx.db.insert("webhook_events", row);
    await ctx.db.insert("migrations", { digest: args.digest, counts });
    return counts;
  },
});

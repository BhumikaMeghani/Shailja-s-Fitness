import { ConvexError, v } from "convex/values";
import { env, mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { booking, user, session as sessionValidator } from "./schema";

const key = { server_key: v.string() };
const active = new Set(["demo", "held", "pending", "confirmed"]);
const activeStatuses = ["demo", "held", "pending", "confirmed"] as const;

function authorize(value: string) {
  // Only the trusted Flask server calls this API. Never send this key to browsers.
  if (!env.STUDIO_SERVER_KEY || env.STUDIO_SERVER_KEY.length < 32 ||
      value !== env.STUDIO_SERVER_KEY) throw new ConvexError("Unauthorized");
}

function plain<T extends { _id: unknown; _creationTime: number }>(row: T) {
  const { _id, _creationTime, ...value } = row;
  return value;
}

async function byId(ctx: QueryCtx | MutationCtx, id: string) {
  return ctx.db.query("bookings").withIndex("by_logical_id", q => q.eq("id", id)).unique();
}

async function atSlot(ctx: QueryCtx | MutationCtx, starts_at: string) {
  const rows = await Promise.all(activeStatuses.map(status => ctx.db.query("bookings")
    .withIndex("by_starts_at_and_status", q => q.eq("starts_at", starts_at).eq("status", status))
    .unique()));
  return rows.filter((row): row is Doc<"bookings"> => row !== null);
}

function occupied(row: Doc<"bookings">, now: number) {
  return active.has(row.status) &&
    !(row.status === "held" && row.expires !== null && row.expires < now);
}

export const getSession = query({
  args: { ...key, token_hash: v.string(), now: v.number() },
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = await ctx.db.query("sessions")
      .withIndex("by_token_hash", q => q.eq("token_hash", args.token_hash)).unique();
    return row && row.expires > args.now ? plain(row) : null;
  },
});

// Bootstrap needs both records. Resolve them in one transaction/HTTP round trip;
// return only the email, never the user's password hash.
export const getSessionContext = query({
  args: { ...key, token_hash: v.string(), now: v.number() },
  returns: v.union(v.object({
    session: sessionValidator,
    user: v.union(v.object({ email: v.string() }), v.null()),
  }), v.null()),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = await ctx.db.query("sessions")
      .withIndex("by_token_hash", q => q.eq("token_hash", args.token_hash)).unique();
    if (!row || row.expires <= args.now) return null;
    const account = row.user_id === null ? null : await ctx.db.query("users")
      .withIndex("by_logical_id", q => q.eq("id", row.user_id!)).unique();
    return { session: plain(row), user: account ? { email: account.email } : null };
  },
});

export const rotateSession = mutation({
  args: { ...key, old_hash: v.string(), record: sessionValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    if (args.record.user_id !== null && !await ctx.db.query("users")
      .withIndex("by_logical_id", q => q.eq("id", args.record.user_id!)).unique()) {
      throw new ConvexError("Account not found.");
    }
    const old = await ctx.db.query("sessions")
      .withIndex("by_token_hash", q => q.eq("token_hash", args.old_hash)).unique();
    if (old) await ctx.db.delete("sessions", old._id);
    // Bounded opportunistic cleanup; no global scan on every request.
    const expired = await ctx.db.query("sessions")
      .withIndex("by_expires", q => q.lt("expires", Date.now() / 1000)).take(100);
    for (const row of expired) await ctx.db.delete("sessions", row._id);
    await ctx.db.insert("sessions", args.record);
    return null;
  },
});

export const getUser = query({
  args: { ...key, field: v.union(v.literal("id"), v.literal("email")), value: v.string() },
  returns: v.union(user, v.null()),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = args.field === "id"
      ? await ctx.db.query("users").withIndex("by_logical_id", q => q.eq("id", args.value)).unique()
      : await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.value)).unique();
    return row ? plain(row) : null;
  },
});

export const register = mutation({
  args: { ...key, id: v.string(), email: v.string(), password_hash: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    if (await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique())
      return null;
    await ctx.db.insert("users", { id: args.id, email: args.email, password_hash: args.password_hash });
    return args.id;
  },
});

export const limited = mutation({
  args: { ...key, bucket: v.string(), maximum: v.number(), window: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const now = Math.floor(Date.now() / 1000);
    const expired = await ctx.db.query("attempts")
      .withIndex("by_created", q => q.lt("created", now - 86400)).take(100);
    for (const row of expired) await ctx.db.delete("attempts", row._id);
    // Preserve the exact legacy sliding window, including migrated attempts.
    // Count and insert share one transaction; a rejected attempt returns rather
    // than throwing so cleanup and previously accepted attempts stay committed.
    const rows = await ctx.db.query("attempts").withIndex("by_bucket_and_created",
      q => q.eq("bucket", args.bucket).gt("created", now - args.window)).take(args.maximum);
    if (rows.length >= args.maximum) return true;
    await ctx.db.insert("attempts", { bucket: args.bucket, created: now });
    return false;
  },
});

export const taken = query({
  args: { ...key, slots: v.array(v.string()), now: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    // Bound fan-out while allowing a caller to check an entire day's times.
    if (args.slots.length > 64) throw new ConvexError("Check at most 64 slots at once.");
    const slots = [...new Set(args.slots)];
    const results = await Promise.all(slots.map(async slot => {
      const rows = await atSlot(ctx, slot);
      return rows.some(row => occupied(row, args.now));
    }));
    const taken = new Set(slots.filter((_, index) => results[index]));
    return args.slots.filter(slot => taken.has(slot));
  },
});

export const reserve = mutation({
  args: { ...key, record: booking },
  returns: v.object({ record: booking, created: v.boolean() }),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const record = args.record;
    if (!await ctx.db.query("users").withIndex("by_logical_id", q => q.eq("id", record.user_id)).unique())
      throw new ConvexError("Account not found.");
    const rows = await atSlot(ctx, record.starts_at);
    for (const row of rows) {
      if (occupied(row, Math.floor(Date.now() / 1000))) {
        if (row.user_id === record.user_id && row.service === record.service)
          return { record: plain(row), created: false };
        throw new ConvexError("This slot was just reserved. Please choose another time.");
      }
      if (row.status === "held") await ctx.db.patch("bookings", row._id, { status: "expired" });
    }
    // Indexed range read and insertion are atomic under Convex OCC: concurrent
    // customers cannot both claim the same start time, even across Flask workers.
    await ctx.db.insert("bookings", record);
    return { record, created: true };
  },
});

export const getBooking = query({
  args: { ...key, id: v.string(), user_id: v.string() },
  returns: v.union(booking, v.null()),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = await byId(ctx, args.id);
    return row && row.user_id === args.user_id ? plain(row) : null;
  },
});

export const markPending = mutation({
  args: { ...key, id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = await byId(ctx, args.id);
    if (!row || row.status !== "held") throw new ConvexError("This booking cannot create an order.");
    await ctx.db.patch("bookings", row._id, { status: "pending", expires: null });
    return null;
  },
});

export const attachOrder = mutation({
  args: { ...key, id: v.string(), order_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = await byId(ctx, args.id);
    const existing = await ctx.db.query("bookings")
      .withIndex("by_order_id", q => q.eq("order_id", args.order_id)).unique();
    if (!row || row.status !== "pending" || (row.order_id && row.order_id !== args.order_id) ||
        (existing && existing.id !== row.id)) throw new ConvexError("Order is already assigned.");
    await ctx.db.patch("bookings", row._id, { order_id: args.order_id });
    return null;
  },
});

const payment = v.object({
  id: v.string(), order_id: v.string(), amount: v.number(), currency: v.string(), status: v.string(),
});

async function confirm(ctx: MutationCtx, row: Doc<"bookings">,
  value: { id: string; order_id: string; amount: number; currency: string; status: string }) {
  if (value.order_id !== row.order_id || value.amount !== row.amount ||
      value.currency !== "INR" || value.status !== "captured")
    throw new ConvexError("Payment has not been captured for this order and amount.");
  if (!["pending", "confirmed"].includes(row.status))
    throw new ConvexError("This booking cannot be confirmed.");
  if (row.payment_id && row.payment_id !== value.id)
    throw new ConvexError("A different payment has already confirmed this booking.");
  const existing = await ctx.db.query("bookings")
    .withIndex("by_payment_id", q => q.eq("payment_id", value.id)).unique();
  if (existing && existing.id !== row.id)
    throw new ConvexError("This payment has already been processed for another booking.");
  await ctx.db.patch("bookings", row._id, { status: "confirmed", payment_id: value.id });
}

export const confirmPayment = mutation({
  args: { ...key, id: v.string(), payment },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const row = await byId(ctx, args.id);
    if (!row) throw new ConvexError("Booking not found.");
    await confirm(ctx, row, args.payment);
    return null;
  },
});

export const webhook = mutation({
  args: { ...key, event_id: v.string(), payment: v.union(payment, v.null()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    if (await ctx.db.query("webhook_events")
      .withIndex("by_logical_id", q => q.eq("id", args.event_id)).unique()) return true;
    if (args.payment) {
      const row = await ctx.db.query("bookings")
        .withIndex("by_order_id", q => q.eq("order_id", args.payment!.order_id)).unique();
      if (!row) return false; // Tell Razorpay to retry after order reconciliation.
      await confirm(ctx, row, args.payment);
    }
    // Event receipt and confirmation commit together, never in separate calls.
    await ctx.db.insert("webhook_events", { id: args.event_id, created: Math.floor(Date.now() / 1000) });
    return true;
  },
});

// Contact page: every visitor question is stored in query_from_user with a
// created timestamp. The TanStack server is the only caller, like the rest.
export const submitQuery = mutation({
  args: {
    ...key, name: v.string(), address: v.string(),
    email: v.union(v.string(), v.null()), mobile: v.string(), message: v.string(),
  },
  returns: v.object({
    name: v.string(), address: v.string(), email: v.union(v.string(), v.null()),
    mobile: v.string(), message: v.string(), created: v.number(),
  }),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    const record = {
      name: args.name, address: args.address, email: args.email,
      mobile: args.mobile, message: args.message,
      created: Math.floor(Date.now() / 1000),
    };
    await ctx.db.insert("query_from_user", record);
    return record;
  },
});

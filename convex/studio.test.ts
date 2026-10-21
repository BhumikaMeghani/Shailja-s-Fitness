/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const server_key = "test-only-server-key-not-for-production-123456";
const migration_key = "test-only-migration-key-not-for-production-123456";
const user = { id: "1", email: "legacy@example.com", password_hash: "scrypt:preserved" };
const record = {
  id: "legacy-booking", user_id: "1", service: "online", starts_at: "2030-01-01T07:00:00+05:30",
  status: "pending" as const, amount: 12000, duration: 45, currency: "INR" as const,
  expires: null, order_id: "order_legacy", payment_id: null, created: 100,
};
const source = {
  migration_key, digest: "snapshot-1", users: [user],
  sessions: [{ token_hash: "hash", user_id: "1", csrf: "csrf", expires: 9999999999 }],
  attempts: [{ bucket: "legacy", created: Math.floor(Date.now() / 1000) }],
  bookings: [record], webhook_events: [{ id: "event-legacy", created: 100 }],
};

beforeEach(() => {
  vi.stubEnv("STUDIO_SERVER_KEY", server_key);
  vi.stubEnv("STUDIO_MIGRATION_KEY", migration_key);
});
afterEach(() => vi.unstubAllEnvs());

test("all public operations reject missing or incorrect server credentials", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.studio.getUser, { server_key: "bad", field: "id", value: "1" }))
    .rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.studio.register, { server_key: "bad", ...user }))
    .rejects.toThrow("Unauthorized");
  await expect(t.mutation(api.migrate.importSqlite, { ...source, migration_key: "bad" }))
    .rejects.toThrow("Unauthorized");
});

test("Clerk linking preserves id-only records, legacy accounts, sessions and bookings", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.migrate.importSqlite, source);
  const linkId = await t.run(ctx => ctx.db.insert("clerk_accounts", { id: "clerk:user_existing" }));
  const args = { server_key, clerk_user_id: "user_existing", email: user.email, new_user_id: "unused" };
  expect(await t.mutation(api.studio.linkClerkAccount, args)).toEqual({ id: user.id, email: user.email });
  expect(await t.mutation(api.studio.linkClerkAccount, { ...args, new_user_id: "also-unused" }))
    .toEqual({ id: user.id, email: user.email });
  expect(await t.run(ctx => ctx.db.get("clerk_accounts", linkId)))
    .toMatchObject({ id: "clerk:user_existing", user_id: user.id });
  expect(await t.run(ctx => ctx.db.query("clerk_accounts").take(10))).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("users").take(10))).toHaveLength(1);
  expect(await t.query(api.studio.getUser, { server_key, field: "id", value: user.id })).toEqual(user);
  expect(await t.query(api.studio.getBooking, { server_key, id: record.id, user_id: user.id })).toEqual(record);
  expect(await t.query(api.studio.getSession, { server_key, token_hash: "hash", now: 200 }))
    .toEqual(source.sessions[0]);
});

test("new Clerk accounts persist once and distinct identities remain isolated", async () => {
  const t = convexTest(schema, modules);
  const args = { server_key, clerk_user_id: "user_new", email: "NEW@Example.com", new_user_id: "new" };
  expect(await t.mutation(api.studio.linkClerkAccount, args)).toEqual({ id: "new", email: "new@example.com" });
  // Stable Clerk ID wins even if its email later changes to another account's.
  await t.mutation(api.studio.register, { server_key, ...user });
  expect(await t.mutation(api.studio.linkClerkAccount, { ...args, email: user.email }))
    .toEqual({ id: "new", email: "new@example.com" });
  await t.mutation(api.studio.linkClerkAccount, {
    server_key, clerk_user_id: "user_other", email: "other@example.com", new_user_id: "other",
  });
  expect(await t.run(ctx => ctx.db.query("users").take(10))).toHaveLength(3);
  expect(await t.run(ctx => ctx.db.query("clerk_accounts").take(10))).toHaveLength(2);
  expect(await t.query(api.studio.getUser, { server_key, field: "id", value: "new" }))
    .toMatchObject({ password_hash: "!clerk-only" });
});

test("Clerk linking rejects unauthorized calls, conflicting links and ID collisions", async () => {
  const t = convexTest(schema, modules);
  const args = { server_key, clerk_user_id: "user_one", email: user.email, new_user_id: "new" };
  await expect(t.mutation(api.studio.linkClerkAccount, { ...args, server_key: "bad" }))
    .rejects.toThrow("Unauthorized");
  await t.mutation(api.studio.register, { server_key, ...user });
  await t.mutation(api.studio.linkClerkAccount, args);
  await expect(t.mutation(api.studio.linkClerkAccount, { ...args, clerk_user_id: "user_two" }))
    .rejects.toThrow("already linked");
  await expect(t.mutation(api.studio.linkClerkAccount, {
    ...args, clerk_user_id: "user_two", email: "new@example.com", new_user_id: user.id,
  })).rejects.toThrow("already linked");
  await t.mutation(api.studio.register, {
    server_key, id: "unlinked", email: "unlinked@example.com", password_hash: "preserved",
  });
  await expect(t.mutation(api.studio.linkClerkAccount, {
    ...args, clerk_user_id: "user_two", email: "new@example.com", new_user_id: "unlinked",
  })).rejects.toThrow("Account ID is already in use");
  await expect(t.mutation(api.studio.linkClerkAccount, { ...args, clerk_user_id: "" }))
    .rejects.toThrow("Invalid account");
  expect(await t.run(ctx => ctx.db.query("clerk_accounts").take(10))).toHaveLength(1);
});

test("a dangling Clerk link fails closed rather than claiming another account", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.studio.register, { server_key, ...user });
  await t.run(ctx => ctx.db.insert("clerk_accounts", { id: "clerk:user_missing", user_id: "deleted" }));
  await expect(t.mutation(api.studio.linkClerkAccount, {
    server_key, clerk_user_id: "user_missing", email: user.email, new_user_id: "unused",
  })).rejects.toThrow("Linked account not found");
  expect(await t.run(ctx => ctx.db.query("users").take(10))).toHaveLength(1);
});

test("migration preserves every legacy field, is idempotent, and refuses a different source", async () => {
  const t = convexTest(schema, modules);
  const expected = { users: 1, sessions: 1, attempts: 1, bookings: 1, webhook_events: 1 };
  expect(await t.mutation(api.migrate.importSqlite, source)).toEqual(expected);
  expect(await t.mutation(api.migrate.importSqlite, source)).toEqual(expected);
  expect(await t.query(api.studio.getUser, { server_key, field: "id", value: "1" })).toEqual(user);
  expect(await t.query(api.studio.getBooking, { server_key, id: record.id, user_id: "1" })).toEqual(record);
  expect(await t.query(api.studio.getSession, { server_key, token_hash: "hash", now: 200 }))
    .toEqual(source.sessions[0]);
  expect(await t.mutation(api.studio.limited, { server_key, bucket: "legacy", maximum: 1, window: 900 }))
    .toBe(true);
  await expect(t.mutation(api.migrate.importSqlite, { ...source, digest: "different" }))
    .rejects.toThrow("empty target");
  expect(await t.run(async ctx => (await ctx.db.query("users").collect()).length)).toBe(1);
});

test("migration rejects broken foreign keys and duplicate active slots atomically", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.migrate.importSqlite, { ...source, users: [] }))
    .rejects.toThrow("integrity");
  await expect(t.mutation(api.migrate.importSqlite, {
    ...source, bookings: [record, { ...record, id: "duplicate", order_id: "different" }],
  })).rejects.toThrow("integrity");
  expect(await t.run(ctx => ctx.db.query("users").first())).toBeNull();
});

test("expired holds release but pending orders never release; other accounts cannot read", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.studio.register, { server_key, ...user });
  const expired = { ...record, status: "held" as const, order_id: null, expires: 1 };
  await t.run(ctx => ctx.db.insert("bookings", expired));
  expect(await t.query(api.studio.taken, { server_key, slots: [record.starts_at], now: 200 })).toEqual([]);
  await t.mutation(api.studio.reserve, { server_key, record: { ...record, id: "replacement" } });
  expect(await t.query(api.studio.taken, { server_key, slots: [record.starts_at], now: 9999999999 }))
    .toEqual([record.starts_at]);
  expect(await t.query(api.studio.getBooking, { server_key, id: "replacement", user_id: "other" }))
    .toBeNull();
});

test("webhook receipt and confirmation commit atomically and payment IDs cannot be reused", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.migrate.importSqlite, source);
  const payment = { id: "pay_1", order_id: record.order_id, amount: 12000, currency: "INR", status: "captured" };
  expect(await t.mutation(api.studio.webhook, { server_key, event_id: "new", payment })).toBe(true);
  expect(await t.mutation(api.studio.webhook, { server_key, event_id: "new", payment })).toBe(true);
  await expect(t.mutation(api.studio.webhook, {
    server_key, event_id: "bad", payment: { ...payment, id: "pay_different" },
  })).rejects.toThrow("different payment");
  expect(await t.run(ctx => ctx.db.query("webhook_events")
    .withIndex("by_logical_id", q => q.eq("id", "bad")).unique())).toBeNull();
  await t.run(ctx => ctx.db.insert("bookings", {
    ...record, id: "second", starts_at: "different", order_id: "order_second",
  }));
  await expect(t.mutation(api.studio.confirmPayment, {
    server_key, id: "second", payment: { ...payment, order_id: "order_second" },
  })).rejects.toThrow("another booking");
});

test("batched availability preserves status, expiry boundaries, order and duplicates", async () => {
  const t = convexTest(schema, modules);
  const cases = [
    { status: "demo", expires: null, taken: true },
    { status: "confirmed", expires: null, taken: true },
    { status: "pending", expires: 1, taken: true },
    { status: "held", expires: 199, taken: false },
    { status: "held", expires: 200, taken: true },
    { status: "held", expires: 201, taken: true },
    { status: "held", expires: null, taken: true },
    { status: "expired", expires: null, taken: false },
  ] as const;
  const slots = cases.map((_, index) => `slot-${index}`);
  await t.run(async ctx => {
    for (const [index, value] of cases.entries()) {
      await ctx.db.insert("bookings", {
        ...record, id: `booking-${index}`, starts_at: slots[index],
        status: value.status, expires: value.expires,
      });
    }
  });
  expect(await t.query(api.studio.taken, { server_key, slots: [...slots, "empty", slots[0]], now: 200 }))
    .toEqual([...slots.filter((_, index) => cases[index].taken), slots[0]]);
  expect(await t.query(api.studio.taken, { server_key, slots: [], now: 200 })).toEqual([]);
  await expect(t.query(api.studio.taken, { server_key: "bad", slots, now: 200 }))
    .rejects.toThrow("Unauthorized");
  await expect(t.query(api.studio.taken, { server_key, slots: Array(65).fill("slot"), now: 200 }))
    .rejects.toThrow("at most 64");
});

test("session context is fresh, credentials are required, and only email is returned", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.migrate.importSqlite, source);
  expect(await t.query(api.studio.getSessionContext, { server_key, token_hash: "hash", now: 200 }))
    .toEqual({ session: source.sessions[0], user: { email: user.email } });
  for (const token_hash of ["unknown", "hash"]) {
    expect(await t.query(api.studio.getSessionContext, { server_key, token_hash, now: 9999999999 }))
      .toBeNull();
  }
  await expect(t.query(api.studio.getSessionContext, { server_key: "bad", token_hash: "hash", now: 200 }))
    .rejects.toThrow("Unauthorized");
  await t.run(async ctx => {
    const account = await ctx.db.query("users").withIndex("by_logical_id", q => q.eq("id", user.id)).unique();
    await ctx.db.delete("users", account!._id);
  });
  expect(await t.query(api.studio.getSessionContext, { server_key, token_hash: "hash", now: 200 }))
    .toEqual({ session: source.sessions[0], user: null });
});

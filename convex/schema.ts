import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { wellnessCatalog } from "./wellnessModel";

// Logical IDs deliberately remain strings, preserving SQLite IDs and all
// existing booking receipts, session references, and Razorpay notes.
export const user = v.object({
  id: v.string(), email: v.string(), password_hash: v.string(),
});
export const session = v.object({
  token_hash: v.string(), user_id: v.union(v.string(), v.null()),
  csrf: v.string(), expires: v.number(),
});
export const attempt = v.object({ bucket: v.string(), created: v.number() });
export const booking = v.object({
  id: v.string(), user_id: v.string(), service: v.string(), starts_at: v.string(),
  status: v.union(v.literal("demo"), v.literal("held"), v.literal("pending"),
    v.literal("confirmed"), v.literal("expired")),
  amount: v.union(v.number(), v.null()), duration: v.union(v.number(), v.null()),
  currency: v.literal("INR"), expires: v.union(v.number(), v.null()),
  order_id: v.union(v.string(), v.null()), payment_id: v.union(v.string(), v.null()),
  created: v.number(),
});
export const webhookEvent = v.object({ id: v.string(), created: v.number() });
// Contact-page submissions. Convex table names must be lowercase snake_case,
// so the requested "Query_From_User" table is stored as query_from_user.
export const queryFromUser = v.object({
  name: v.string(), address: v.string(), email: v.union(v.string(), v.null()),
  mobile: v.string(), message: v.string(), created: v.number(),
});
// Bootcamp-page enquiries from organisations. Convex table names must be
// lowercase snake_case, so the requested "BootCamps_Booking" table is stored
// as bootcamps_booking.
export const bootcampBooking = v.object({
  user_id: v.string(),
  organisation: v.string(), contact_person: v.string(), email: v.string(),
  contact_number: v.string(), organisation_category: v.string(),
  bootcamp_type: v.string(), purpose: v.union(v.string(), v.null()),
  participants: v.string(), preferred_date: v.union(v.string(), v.null()),
  preferred_duration: v.union(v.string(), v.null()), preferred_mode: v.string(),
  city_venue: v.union(v.string(), v.null()),
  additional_requirements: v.union(v.string(), v.null()), created: v.number(),
});

export default defineSchema({
  users: defineTable(user).index("by_logical_id", ["id"]).index("by_email", ["email"]),
  sessions: defineTable(session).index("by_token_hash", ["token_hash"])
    .index("by_expires", ["expires"]),
  attempts: defineTable(attempt).index("by_bucket_and_created", ["bucket", "created"])
    .index("by_created", ["created"]),
  bookings: defineTable(booking).index("by_logical_id", ["id"])
    .index("by_starts_at_and_status", ["starts_at", "status"]).index("by_order_id", ["order_id"])
    .index("by_payment_id", ["payment_id"]),
  webhook_events: defineTable(webhookEvent).index("by_logical_id", ["id"]),
  query_from_user: defineTable(queryFromUser).index("by_created", ["created"]),
  bootcamps_booking: defineTable(bootcampBooking)
    .index("by_created", ["created"]).index("by_user_id", ["user_id"]),
  wellness_catalog: defineTable(wellnessCatalog)
    .index("by_version_and_route", ["version", "route"]),
  migrations: defineTable({ digest: v.string(), counts: v.record(v.string(), v.number()) })
    .index("by_digest", ["digest"]),
});

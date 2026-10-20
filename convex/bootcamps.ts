import { ConvexError, v } from "convex/values";
import { env, mutation } from "./_generated/server";
import { bootcampBooking } from "./schema";

const key = { server_key: v.string() };

function authorize(value: string) {
  // Only the trusted TanStack server calls this API. Never send this key to browsers.
  if (!env.STUDIO_SERVER_KEY || env.STUDIO_SERVER_KEY.length < 32 ||
      value !== env.STUDIO_SERVER_KEY) throw new ConvexError("Unauthorized");
}

// Bootcamp page: organiser enquiries from signed-in visitors. The TanStack
// server is the only caller, and each record lands in bootcamps_booking
// (the requested "BootCamps_Booking") with a created timestamp.
export const submitEnquiry = mutation({
  args: { ...key, record: bootcampBooking.omit("created") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    // Mutations may read the wall clock; queries may not.
    const created = Math.floor(Date.now() / 1000);
    await ctx.db.insert("bootcamps_booking", { ...args.record, created });
    return { created };
  },
});

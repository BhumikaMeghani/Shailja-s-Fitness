import { ConvexError, v } from "convex/values";
import { env, mutation } from "./_generated/server";
import { trainersApplying } from "./schema";

const key = { server_key: v.string() };

function authorize(value: string) {
  // Only the trusted TanStack server calls this API. Never send this key to browsers.
  if (!env.STUDIO_SERVER_KEY || env.STUDIO_SERVER_KEY.length < 32 ||
      value !== env.STUDIO_SERVER_KEY) throw new ConvexError("Unauthorized");
}

// Trainers page: "Become a Trainer" training programme enquiries from
// signed-in visitors. The TanStack server is the only caller, and each record
// lands in trainers_applying (the requested "Trainers_Applying") with a
// created timestamp.
export const submitEnquiry = mutation({
  args: { ...key, record: trainersApplying.omit("created") },
  returns: v.object({ created: v.number() }),
  handler: async (ctx, args) => {
    authorize(args.server_key);
    // Mutations may read the wall clock; queries may not.
    const created = Math.floor(Date.now() / 1000);
    await ctx.db.insert("trainers_applying", { ...args.record, created });
    return { created };
  },
});

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./_helpers";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("applications").collect();
  },
});

export const submit = mutation({
  args: {
    sessionToken: v.string(),
    handles: v.string(),
    whyJoin: v.string(),
    role: v.string(),
  },
  handler: async (ctx, { sessionToken, handles, whyJoin, role }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.includes("recruit")) throw new Error("Only recruits can submit applications");
    // Check for existing application
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .first();
    if (existing) throw new Error("You have already submitted an application");
    if (!handles.trim()) throw new Error("Please fill in your handles");
    if (!whyJoin.trim()) throw new Error("Please fill in why you want to join");
    if (!role.trim()) throw new Error("Please fill in what you want to do");
    await ctx.db.insert("applications", {
      userId: user._id,
      userName: user.username,
      handles: handles.trim(),
      whyJoin: whyJoin.trim(),
      role: role.trim(),
      status: "pending",
    });
  },
});

export const markReviewed = mutation({
  args: { sessionToken: v.string(), applicationId: v.id("applications") },
  handler: async (ctx, { sessionToken, applicationId }) => {
    const admin = await requireSession(ctx.db, sessionToken);
    if (!admin.roles.includes("admin")) throw new Error("Not authorized");
    await ctx.db.patch(applicationId, { status: "reviewed" });
  },
});

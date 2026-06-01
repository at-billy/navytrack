import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requireSession, assertRole } from "./_helpers";

const SHEETS_WEBHOOK = "https://script.google.com/macros/s/AKfycbyZeqjMZVYfoqlfOEljh9xN03Bd79GQojGvXqaNYmvH4owbZrzESTi_kXyryLM4l7WUFA/exec";

export const getAll = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireSession(ctx.db, sessionToken);
    assertRole(user, ["admin"]);
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
    if (!user.roles.includes("recruit")) throw new ConvexError("Only recruits can submit applications");
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .first();
    if (existing) throw new ConvexError("You have already submitted an application");
    if (!handles.trim()) throw new ConvexError("Please fill in your handles");
    if (!whyJoin.trim()) throw new ConvexError("Please fill in why you want to join");
    if (!role.trim()) throw new ConvexError("Please fill in what you want to do");
    await ctx.db.insert("applications", {
      userId: user._id,
      userName: user.username,
      handles: handles.trim(),
      whyJoin: whyJoin.trim(),
      role: role.trim(),
      status: "pending",
    });
    // Fire-and-forget sync to Google Sheets
    await ctx.scheduler.runAfter(0, internal.applications.syncToSheets, {
      username: user.username,
      handles: handles.trim(),
      whyJoin: whyJoin.trim(),
      role: role.trim(),
    });
  },
});

export const syncToSheets = internalAction({
  args: {
    username: v.string(),
    handles: v.string(),
    whyJoin: v.string(),
    role: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      await fetch(SHEETS_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    } catch (e) {
      console.error("Google Sheets sync failed:", e);
    }
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), applicationId: v.id("applications") },
  handler: async (ctx, { sessionToken, applicationId }) => {
    const admin = await requireSession(ctx.db, sessionToken);
    if (!admin.roles.includes("admin")) throw new ConvexError("Not authorized");
    await ctx.db.delete(applicationId);
  },
});

export const markReviewed = mutation({
  args: { sessionToken: v.string(), applicationId: v.id("applications") },
  handler: async (ctx, { sessionToken, applicationId }) => {
    const admin = await requireSession(ctx.db, sessionToken);
    if (!admin.roles.includes("admin")) throw new ConvexError("Not authorized");
    await ctx.db.patch(applicationId, { status: "reviewed" });
  },
});

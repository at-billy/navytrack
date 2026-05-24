import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireSession } from "./_helpers";

const SHEETS_WEBHOOK = "https://script.google.com/macros/s/AKfycbzmYzKKq8iiGn_8WY5i0mnnHjMjhmbeaC4hOAOY7MnkY64Mk3BxinOqPnQWKfG99ugJzQ/exec";

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

export const markReviewed = mutation({
  args: { sessionToken: v.string(), applicationId: v.id("applications") },
  handler: async (ctx, { sessionToken, applicationId }) => {
    const admin = await requireSession(ctx.db, sessionToken);
    if (!admin.roles.includes("admin")) throw new Error("Not authorized");
    await ctx.db.patch(applicationId, { status: "reviewed" });
  },
});

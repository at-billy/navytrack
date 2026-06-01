import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession, requireMember } from "./_helpers";

export const getAll = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireMember(ctx.db, sessionToken);
    return await ctx.db.query("archive").order("desc").collect();
  },
});

export const removeLog = mutation({
  args: { sessionToken: v.string(), id: v.id("archive") },
  handler: async (ctx, { sessionToken, id }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.includes("admin")) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});

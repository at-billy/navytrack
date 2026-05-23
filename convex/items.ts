import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./_helpers";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("items").collect();
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    quantity: v.number(),
    quality: v.optional(v.number()),
    location: v.string(),
    system: v.optional(v.string()),
    heldBy: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, ...rest }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canAdd = user.roles.some(r => ["admin", "command", "core", "member"].includes(r));
    if (!canAdd) throw new Error("Not authorized");
    const id = await ctx.db.insert("items", {
      ...rest,
      addedBy: user._id,
      addedByName: user.username,
      status: "available",
    });
    await ctx.db.insert("archive", {
      type: "item_added",
      userId: user._id,
      userName: user.username,
      details: { name: rest.name, category: rest.category, quantity: rest.quantity },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    itemId: v.id("items"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    quantity: v.optional(v.number()),
    quality: v.optional(v.number()),
    location: v.optional(v.string()),
    system: v.optional(v.string()),
    heldBy: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, itemId, ...rest }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canEdit = user.roles.some(r => ["admin", "command", "core"].includes(r));
    if (!canEdit) throw new Error("Not authorized");
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(itemId, patch);
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), itemId: v.id("items") },
  handler: async (ctx, { sessionToken, itemId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canDelete = user.roles.some(r => ["admin", "command"].includes(r));
    if (!canDelete) throw new Error("Not authorized");
    await ctx.db.delete(itemId);
  },
});

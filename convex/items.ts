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
    subcategory: v.optional(v.string()),
    description: v.optional(v.string()),
    quantity: v.number(),
    quality: v.optional(v.number()),
    location: v.string(),
    system: v.optional(v.string()),
    heldBy: v.optional(v.string()),
    compType: v.optional(v.string()),
    compGrade: v.optional(v.string()),
    compSize: v.optional(v.number()),
    compTier: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, ...rest }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canAdd = user.roles.some(r => ["admin", "command", "core", "member"].includes(r));
    if (!canAdd) throw new Error("Not authorized");

    // Auto-stack: find an identical available item and increment its quantity
    const all = await ctx.db.query("items").withIndex("by_status", q => q.eq("status", "available")).collect();
    const match = all.find(i =>
      i.name        === rest.name &&
      i.category    === rest.category &&
      (i.subcategory ?? null) === (rest.subcategory ?? null) &&
      (i.description ?? null) === (rest.description ?? null) &&
      (i.quality     ?? null) === (rest.quality     ?? null) &&
      i.location    === rest.location &&
      (i.system      ?? null) === (rest.system      ?? null) &&
      (i.heldBy      ?? null) === (rest.heldBy      ?? null) &&
      (i.compType    ?? null) === (rest.compType    ?? null) &&
      (i.compGrade   ?? null) === (rest.compGrade   ?? null) &&
      (i.compSize    ?? null) === (rest.compSize    ?? null) &&
      (i.compTier    ?? null) === (rest.compTier    ?? null)
    );

    if (match) {
      await ctx.db.patch(match._id, { quantity: match.quantity + rest.quantity });
      await ctx.db.insert("archive", {
        type: "item_added",
        userId: user._id,
        userName: user.username,
        details: { name: rest.name, category: rest.category, quantity: rest.quantity },
      });
      return match._id;
    }

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
    subcategory: v.optional(v.string()),
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
    const canEditAny = user.roles.some(r => ["admin", "command"].includes(r));
    const canEditOwn = user.roles.some(r => ["core", "member"].includes(r));
    if (!canEditAny && !canEditOwn) throw new Error("Not authorized");
    if (!canEditAny) {
      const item = await ctx.db.get(itemId);
      if (!item) throw new Error("Item not found");
      if (item.addedBy !== user._id) throw new Error("Not authorized — you can only edit items you added");
    }
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(itemId, patch);
  },
});

export const handOut = mutation({
  args: {
    sessionToken: v.string(),
    itemId: v.id("items"),
    handedOutTo: v.string(),
    handedOutQty: v.number(),
  },
  handler: async (ctx, { sessionToken, itemId, handedOutTo, handedOutQty }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canEdit = user.roles.some(r => ["admin", "command", "core"].includes(r));
    if (!canEdit) throw new Error("Not authorized");
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error("Item not found");
    if (handedOutQty <= 0 || handedOutQty > item.quantity) throw new Error("Invalid quantity");

    if (handedOutQty === item.quantity) {
      // Hand out entire item
      await ctx.db.patch(itemId, { status: "handed_out", handedOutTo, handedOutQty, heldBy: handedOutTo });
    } else {
      // Partial handout: reduce original quantity, create new handed-out record
      await ctx.db.patch(itemId, { quantity: item.quantity - handedOutQty });
      await ctx.db.insert("items", {
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        description: item.description,
        quantity: handedOutQty,
        quality: item.quality,
        location: item.location,
        system: item.system,
        addedBy: item.addedBy,
        addedByName: item.addedByName,
        heldBy: handedOutTo,
        handedOutTo,
        handedOutQty,
        compType: item.compType,
        compGrade: item.compGrade,
        compSize: item.compSize,
        compTier: item.compTier,
        status: "handed_out",
      });
    }
    await ctx.db.insert("archive", {
      type: "item_handed_out",
      userId: user._id,
      userName: user.username,
      details: { name: item.name, category: item.category, handedOutTo, handedOutQty },
    });
  },
});

export const markUsed = mutation({
  args: {
    sessionToken: v.string(),
    itemId: v.id("items"),
    usedFor: v.string(),
  },
  handler: async (ctx, { sessionToken, itemId, usedFor }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canEdit = user.roles.some(r => ["admin", "command"].includes(r));
    if (!canEdit) throw new Error("Not authorized");
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error("Item not found");
    if (item.category !== "wikelo") throw new Error("Only Wikelo items can be marked as used");
    await ctx.db.patch(itemId, { status: "used", usedFor });
    await ctx.db.insert("archive", {
      type: "item_used",
      userId: user._id,
      userName: user.username,
      details: { name: item.name, usedFor },
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), itemId: v.id("items") },
  handler: async (ctx, { sessionToken, itemId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canDeleteAny = user.roles.some(r => ["admin", "command"].includes(r));
    const canDeleteOwn = user.roles.some(r => ["core", "member"].includes(r));
    if (!canDeleteAny && !canDeleteOwn) throw new Error("Not authorized");
    const item = await ctx.db.get(itemId);
    if (!item) throw new Error("Item not found");
    if (!canDeleteAny && item.addedBy !== user._id) throw new Error("Not authorized — you can only remove items you added");
    await ctx.db.delete(itemId);
    await ctx.db.insert("archive", {
      type: "item_removed",
      userId: user._id,
      userName: user.username,
      details: { name: item.name, category: item.category },
    });
  },
});

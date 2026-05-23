import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession } from "./_helpers";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("logistics").collect();
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    destinationSystem: v.optional(v.string()),
    destinationLocation: v.string(),
    storedBy: v.string(),
    itemIds: v.array(v.id("items")),
  },
  handler: async (ctx, { sessionToken, destinationSystem, destinationLocation, storedBy, itemIds }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canDo = user.roles.some(r => ["admin", "command", "core", "member"].includes(r));
    if (!canDo) throw new Error("Not authorized");
    if (!itemIds.length) throw new Error("Select at least one item");
    if (!destinationLocation.trim()) throw new Error("Select a destination location");

    const items = [];
    for (const itemId of itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item) throw new Error("Item not found");
      if (item.status !== "available") throw new Error(`${item.name} is not in inventory`);
      items.push({
        itemId: item._id,
        name: item.name,
        category: item.category,
        fromSystem: item.system,
        fromLocation: item.location,
      });
    }

    await ctx.db.insert("logistics", {
      status: "open",
      createdBy: user._id,
      createdByName: user.username,
      destinationSystem: destinationSystem || undefined,
      destinationLocation: destinationLocation.trim(),
      storedBy: storedBy.trim() || user.username,
      items,
    });
  },
});

export const complete = mutation({
  args: {
    sessionToken: v.string(),
    logisticsId: v.id("logistics"),
    storedBy: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, logisticsId, storedBy }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canDo = user.roles.some(r => ["admin", "command", "core", "member"].includes(r));
    if (!canDo) throw new Error("Not authorized");

    const task = await ctx.db.get(logisticsId);
    if (!task) throw new Error("Logistics task not found");
    if (task.status !== "open") throw new Error("Task is already completed");

    const finalStoredBy = (storedBy && storedBy.trim()) ? storedBy.trim() : task.storedBy;

    for (const taskItem of task.items) {
      const item = await ctx.db.get(taskItem.itemId);
      if (item) {
        await ctx.db.patch(taskItem.itemId, {
          location: task.destinationLocation,
          system: task.destinationSystem,
          heldBy: finalStoredBy,
        });
      }
    }

    await ctx.db.patch(logisticsId, {
      status: "completed",
      completedBy: user._id,
      completedByName: user.username,
      storedBy: finalStoredBy,
    });
  },
});

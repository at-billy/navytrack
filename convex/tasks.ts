import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession } from "./_helpers";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    goal: v.optional(v.string()),
    priority: v.string(),
    targetRoles: v.array(v.string()),
    requiredItems: v.optional(v.array(v.object({
      name: v.string(),
      category: v.string(),
      quantityNeeded: v.number(),
    }))),
  },
  handler: async (ctx, { sessionToken, ...rest }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canCreate = user.roles.some(r => ["admin", "command"].includes(r));
    if (!canCreate) throw new ConvexError("Not authorized");
    const id = await ctx.db.insert("tasks", {
      ...rest,
      status: "open",
      createdBy: user._id,
      createdByName: user.username,
      members: [],
    });
    await ctx.db.insert("archive", {
      type: "task_created",
      userId: user._id,
      userName: user.username,
      details: { title: rest.title, priority: rest.priority },
    });
    return id;
  },
});

export const join = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Project not found");
    if (task.status !== "open") throw new ConvexError("Project is not open");
    if (task.members.some(m => m.userId === user._id)) throw new ConvexError("Already joined");
    await ctx.db.patch(taskId, {
      members: [...task.members, { userId: user._id, userName: user.username }],
    });
  },
});

export const leave = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Project not found");
    await ctx.db.patch(taskId, {
      members: task.members.filter(m => m.userId !== user._id),
    });
  },
});

export const close = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canClose = user.roles.some(r => ["admin", "command"].includes(r));
    if (!canClose) throw new ConvexError("Not authorized");
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Project not found");
    await ctx.db.patch(taskId, { status: "closed" });
    await ctx.db.insert("archive", {
      type: "task_closed",
      userId: user._id,
      userName: user.username,
      details: { title: task.title },
    });
  },
});

export const reopen = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canEdit = user.roles.some(r => ["admin", "command"].includes(r));
    if (!canEdit) throw new ConvexError("Not authorized");
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Project not found");
    await ctx.db.patch(taskId, { status: "open" });
  },
});

export const cancel = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.includes("admin")) throw new ConvexError("Not authorized");
    await ctx.db.patch(taskId, { status: "cancelled" });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    goal: v.optional(v.string()),
    priority: v.optional(v.string()),
    targetRoles: v.optional(v.array(v.string())),
    requiredItems: v.optional(v.array(v.object({
      name: v.string(),
      category: v.string(),
      quantityNeeded: v.number(),
    }))),
  },
  handler: async (ctx, { sessionToken, taskId, ...fields }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Project not found");
    const isAdmin = user.roles.some(r => ["admin", "command"].includes(r));
    const isCreator = task.createdBy === user._id;
    if (!isAdmin && !isCreator) throw new ConvexError("Not authorized");
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(taskId, patch);
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.includes("admin")) throw new ConvexError("Not authorized");
    await ctx.db.delete(taskId);
  },
});

export const useItems = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.some(r => ["admin", "command"].includes(r))) throw new ConvexError("Not authorized");
    const task = await ctx.db.get(taskId);
    if (!task) throw new ConvexError("Project not found");
    if (task.status !== "open") throw new ConvexError("Project is not open");
    if (!task.requiredItems?.length) throw new ConvexError("No required items on this project");

    const available = await ctx.db.query("items").withIndex("by_status", q => q.eq("status", "available")).collect();
    const usedLog: { name: string; quantity: number }[] = [];

    for (const req of task.requiredItems) {
      const matching = available.filter(i => i.name === req.name && i.category === req.category);
      let needed = req.quantityNeeded;
      for (const item of matching) {
        if (needed <= 0) break;
        if (item.quantity <= needed) {
          await ctx.db.patch(item._id, { status: "used", usedFor: task.title });
          usedLog.push({ name: item.name, quantity: item.quantity });
          needed -= item.quantity;
        } else {
          await ctx.db.patch(item._id, { quantity: item.quantity - needed });
          await ctx.db.insert("items", {
            name: item.name, category: item.category,
            subcategory: item.subcategory, description: item.description,
            quantity: needed, quality: item.quality, location: item.location,
            system: item.system, addedBy: item.addedBy, addedByName: item.addedByName,
            heldBy: item.heldBy, compType: item.compType, compGrade: item.compGrade,
            compSize: item.compSize, compTier: item.compTier,
            status: "used", usedFor: task.title,
          });
          usedLog.push({ name: item.name, quantity: needed });
          needed = 0;
        }
      }
    }

    if (!usedLog.length) throw new ConvexError("No matching items found in inventory");
    await ctx.db.insert("archive", {
      type: "items_used_for_project",
      userId: user._id,
      userName: user.username,
      details: { taskTitle: task.title, items: usedLog },
    });
  },
});

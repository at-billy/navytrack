import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
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
  },
  handler: async (ctx, { sessionToken, ...rest }) => {
    const user = await requireSession(ctx.db, sessionToken);
    const canCreate = user.roles.some(r => ["admin", "command"].includes(r));
    if (!canCreate) throw new Error("Not authorized");
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
    if (!task) throw new Error("Project not found");
    if (task.status !== "open") throw new Error("Project is not open");
    if (task.members.some(m => m.userId === user._id)) throw new Error("Already joined");
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
    if (!task) throw new Error("Project not found");
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
    if (!canClose) throw new Error("Not authorized");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Project not found");
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
    if (!canEdit) throw new Error("Not authorized");
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Project not found");
    await ctx.db.patch(taskId, { status: "open" });
  },
});

export const cancel = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.includes("admin")) throw new Error("Not authorized");
    await ctx.db.patch(taskId, { status: "cancelled" });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { sessionToken, taskId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    if (!user.roles.includes("admin")) throw new Error("Not authorized");
    await ctx.db.delete(taskId);
  },
});

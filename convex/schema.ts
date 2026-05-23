import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    passwordHash: v.string(),
    roles: v.array(v.string()), // "recruit" | "member" | "core" | "command" | "admin"
  }).index("by_username", ["username"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  // Navy inventory — all items the org has
  items: defineTable({
    name: v.string(),
    category: v.string(),         // "FPS" | "ARMA" | "Components" | ...
    description: v.optional(v.string()),
    quantity: v.number(),
    quality: v.optional(v.number()),
    location: v.string(),
    system: v.optional(v.string()),
    addedBy: v.id("users"),
    addedByName: v.string(),
    heldBy: v.optional(v.string()), // name of member currently holding it
    status: v.string(),             // "available" | "in_use" | "removed"
  }).index("by_status", ["status"]),

  // Projects / tasks
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    goal: v.optional(v.string()),
    priority: v.string(),           // "urgent" | "high" | "normal" | "whenever"
    targetRoles: v.array(v.string()),
    status: v.string(),             // "open" | "closed" | "cancelled"
    createdBy: v.id("users"),
    createdByName: v.string(),
    members: v.array(v.object({
      userId: v.id("users"),
      userName: v.string(),
    })),
  }).index("by_status", ["status"]),

  lotteries: defineTable({
    title: v.string(),
    status: v.string(), // "draft" | "open" | "drawn" | "closed"
    createdBy: v.id("users"),
    createdByName: v.string(),
    items: v.array(v.object({
      id: v.string(),
      name: v.string(),
      type: v.string(),
      typeName: v.string(),
      grade: v.string(),
      size: v.number(),
      tier: v.string(),
      value: v.number(),
    })),
    packages: v.optional(v.array(v.object({
      pkgId: v.string(),
      totalValue: v.number(),
      items: v.array(v.object({
        id: v.string(),
        name: v.string(),
        type: v.string(),
        typeName: v.string(),
        grade: v.string(),
        size: v.number(),
        tier: v.string(),
        value: v.number(),
      })),
      pickedBy: v.optional(v.id("users")),
      pickedByName: v.optional(v.string()),
      interested: v.optional(v.array(v.object({ id: v.string(), name: v.string() }))),
      winner: v.optional(v.object({ id: v.string(), name: v.string() })),
    }))),
    externalNames: v.optional(v.array(v.string())),
  }).index("by_status", ["status"]),

  archive: defineTable({
    type: v.string(),
    userId: v.id("users"),
    userName: v.string(),
    details: v.any(),
  }),
});

import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireSession, assertRole } from "./_helpers";
import { assertLen, assertPositiveInt } from "./_constants";

// Admin-only ledger of org aUEC. Balance is the running sum of the entries.
function balanceOf(txns: { type: string; amount: number }[]) {
  return txns.reduce((s, t) => s + (t.type === "deposit" ? t.amount : -t.amount), 0);
}

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireSession(ctx.db, sessionToken);
    assertRole(user, ["admin"]);
    return await ctx.db.query("bank").collect();
  },
});

export const deposit = mutation({
  args: { sessionToken: v.string(), amount: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, amount, note }) => {
    const user = await requireSession(ctx.db, sessionToken);
    assertRole(user, ["admin"]);
    assertPositiveInt(amount, "amount");
    if (note) assertLen(note, 200, "note");
    await ctx.db.insert("bank", {
      type: "deposit", amount, note: note?.trim() || undefined,
      createdBy: user._id, createdByName: user.username,
    });
  },
});

export const withdraw = mutation({
  args: { sessionToken: v.string(), amount: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, amount, note }) => {
    const user = await requireSession(ctx.db, sessionToken);
    assertRole(user, ["admin"]);
    assertPositiveInt(amount, "amount");
    if (note) assertLen(note, 200, "note");
    const balance = balanceOf(await ctx.db.query("bank").collect());
    if (amount > balance) throw new ConvexError("Not enough funds in the bank");
    await ctx.db.insert("bank", {
      type: "withdrawal", amount, note: note?.trim() || undefined,
      createdBy: user._id, createdByName: user.username,
    });
  },
});

// Remove a ledger entry (corrections).
export const remove = mutation({
  args: { sessionToken: v.string(), txnId: v.id("bank") },
  handler: async (ctx, { sessionToken, txnId }) => {
    const user = await requireSession(ctx.db, sessionToken);
    assertRole(user, ["admin"]);
    await ctx.db.delete(txnId);
  },
});

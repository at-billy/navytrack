import { DatabaseReader } from "./_generated/server";
import { ConvexError } from "convex/values";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function requireSession(db: DatabaseReader, token: string) {
  const session = await db
    .query("sessions")
    .withIndex("by_token", q => q.eq("token", token))
    .first();
  if (!session) throw new ConvexError("SESSION_INVALID");
  if (Date.now() - session.createdAt > SESSION_TTL_MS) throw new ConvexError("SESSION_EXPIRED");
  const user = await db.get(session.userId);
  if (!user || user.roles.includes("removed")) throw new ConvexError("SESSION_INVALID");
  return user;
}

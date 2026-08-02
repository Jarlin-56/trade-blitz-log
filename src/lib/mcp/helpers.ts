import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

export type Client = ReturnType<typeof supabaseForUser>;

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) throw new Error("Not authenticated");
  return supabaseForUser(ctx);
}

/** Resolve the profile to operate on: explicit id, else the user's active profile. */
export async function resolveProfileId(supabase: Client, profileId?: string) {
  if (profileId) return profileId;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No profile found for this user");
  return data[0].id as string;
}

export function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

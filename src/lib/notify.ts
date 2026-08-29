import { createServiceClient } from "@/lib/supabase/service";

/**
 * One fan-out function for all in-app notifications. SMS/email/push can be
 * added per-type later without touching any call site — don't build
 * channel-specific plumbing before there's a channel to wire up.
 */
export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string,
  data: Record<string, unknown> = {}
) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
    data,
  });
  if (error) {
    // Notifications are best-effort — never fail the caller's transaction
    // over a notification write.
    console.error("notify() failed:", error.message);
  }
}

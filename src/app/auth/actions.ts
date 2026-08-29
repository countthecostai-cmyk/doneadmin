"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signUp(formData: FormData): Promise<{ error?: string }> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const fullName = String(formData.get("full_name") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo:
        (process.env.NEXT_PUBLIC_SITE_URL ?? "") + "/auth/callback",
    },
  });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signIn(formData: FormData): Promise<{ error?: string }> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

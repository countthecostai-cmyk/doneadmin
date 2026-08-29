"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import type { PricingModel } from "@/lib/database.types";

// categories/task_types/task_type_addons all grant admin full read+write via
// RLS ("for all using (is_admin(auth.uid()))" in 0002) — the normal
// per-request client is enough here, no service-role needed.

function toInt(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

// Bound directly as bare `<form action>` references with no inline error
// UI (same convention as acceptTask/startTask in the original tasks/actions.ts)
// — failures throw rather than returning a value that has nowhere to render.
export async function toggleCategoryActive(categoryId: string, active: boolean): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("Admin only.");

  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ active }).eq("id", categoryId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/settings");
}

export async function createCategory(formData: FormData): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  if (!slug || !name) return { error: "Slug and name are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    slug,
    name,
    description: description || null,
    icon: icon || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return {};
}

export async function toggleTaskTypeActive(taskTypeId: string, active: boolean): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("Admin only.");

  const supabase = await createClient();
  const { error } = await supabase.from("task_types").update({ active }).eq("id", taskTypeId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/settings");
}

export async function updateTaskTypePricing(
  taskTypeId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const basePriceCents = toInt(formData.get("base_price_cents"));
  const minPriceCents = toInt(formData.get("min_price_cents"));
  const perUnitRaw = formData.get("price_per_unit_cents");
  const pricePerUnitCents = perUnitRaw === "" || perUnitRaw === null ? null : toInt(perUnitRaw);
  const unitLabel = String(formData.get("unit_label") ?? "").trim() || null;
  const requiresPhotoProof = formData.get("requires_photo_proof") === "on";

  if (basePriceCents < 0 || minPriceCents < 0) return { error: "Prices can't be negative." }

  const supabase = await createClient();
  const { error } = await supabase
    .from("task_types")
    .update({
      base_price_cents: basePriceCents,
      min_price_cents: minPriceCents,
      price_per_unit_cents: pricePerUnitCents,
      unit_label: unitLabel,
      requires_photo_proof: requiresPhotoProof,
    })
    .eq("id", taskTypeId);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return {};
}

export async function createTaskType(formData: FormData): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const categoryId = String(formData.get("category_id") ?? "");
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const pricingModel = String(formData.get("pricing_model") ?? "flat") as PricingModel;
  const basePriceCents = toInt(formData.get("base_price_cents"));
  const minPriceCents = toInt(formData.get("min_price_cents"));
  const perUnitRaw = formData.get("price_per_unit_cents");
  const pricePerUnitCents = perUnitRaw === "" || perUnitRaw === null ? null : toInt(perUnitRaw);
  const unitLabel = String(formData.get("unit_label") ?? "").trim() || null;
  const requiresPhotoProof = formData.get("requires_photo_proof") === "on";

  if (!categoryId || !slug || !name) return { error: "Category, slug, and name are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("task_types").insert({
    category_id: categoryId,
    slug,
    name,
    description: description || null,
    pricing_model: pricingModel,
    base_price_cents: basePriceCents,
    min_price_cents: minPriceCents,
    price_per_unit_cents: pricePerUnitCents,
    unit_label: unitLabel,
    requires_photo_proof: requiresPhotoProof,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return {};
}

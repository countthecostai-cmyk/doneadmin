"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { logAdminAction } from "@/lib/audit-log";
import type { PricingModel, PromotionDiscountType } from "@/lib/database.types";

// service_areas grants admin full read+write via RLS too
// (service_areas_admin_write, "for all using (is_admin(auth.uid()))" in
// 0002) — same normal per-request client as categories/task_types above.

function parseZipCodes(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\s,]+/)
    .map((z) => z.trim())
    .filter(Boolean);
}

function invalidZipCodes(zips: string[]): boolean {
  return zips.some((z) => !/^\d{5}$/.test(z));
}

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

  await logAdminAction(supabase, gate.userId, "category_toggled", "category", categoryId, { active });

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
  const { data, error } = await supabase
    .from("categories")
    .insert({
      slug,
      name,
      description: description || null,
      icon: icon || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await logAdminAction(supabase, gate.userId, "category_created", "category", data?.id ?? null, { slug, name });

  revalidatePath("/admin/settings");
  return {};
}

export async function toggleTaskTypeActive(taskTypeId: string, active: boolean): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("Admin only.");

  const supabase = await createClient();
  const { error } = await supabase.from("task_types").update({ active }).eq("id", taskTypeId);
  if (error) throw new Error(error.message);

  await logAdminAction(supabase, gate.userId, "task_type_toggled", "task_type", taskTypeId, { active });

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

  await logAdminAction(supabase, gate.userId, "task_type_pricing_updated", "task_type", taskTypeId, {
    base_price_cents: basePriceCents,
    min_price_cents: minPriceCents,
    price_per_unit_cents: pricePerUnitCents,
    unit_label: unitLabel,
    requires_photo_proof: requiresPhotoProof,
  });

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
  const { data, error } = await supabase
    .from("task_types")
    .insert({
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
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await logAdminAction(supabase, gate.userId, "task_type_created", "task_type", data?.id ?? null, {
    slug,
    name,
    category_id: categoryId,
    pricing_model: pricingModel,
  });

  revalidatePath("/admin/settings");
  return {};
}

export async function createServiceArea(formData: FormData): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const name = String(formData.get("name") ?? "").trim();
  const zipCodes = parseZipCodes(formData.get("zip_codes"));
  if (!name) return { error: "Name is required." };
  if (zipCodes.length === 0) return { error: "Enter at least one ZIP code." };
  if (invalidZipCodes(zipCodes)) return { error: "ZIP codes must be 5 digits each." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_areas")
    .insert({ name, zip_codes: zipCodes })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await logAdminAction(supabase, gate.userId, "service_area_created", "service_area", data?.id ?? null, {
    name,
    zip_count: zipCodes.length,
  });

  revalidatePath("/admin/settings");
  return {};
}

export async function toggleServiceAreaActive(serviceAreaId: string, active: boolean): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("Admin only.");

  const supabase = await createClient();
  const { error } = await supabase.from("service_areas").update({ active }).eq("id", serviceAreaId);
  if (error) throw new Error(error.message);

  await logAdminAction(supabase, gate.userId, "service_area_toggled", "service_area", serviceAreaId, {
    active,
  });

  revalidatePath("/admin/settings");
}

export async function updateServiceAreaZips(
  serviceAreaId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const name = String(formData.get("name") ?? "").trim();
  const zipCodes = parseZipCodes(formData.get("zip_codes"));
  if (!name) return { error: "Name is required." };
  if (zipCodes.length === 0) return { error: "Enter at least one ZIP code." };
  if (invalidZipCodes(zipCodes)) return { error: "ZIP codes must be 5 digits each." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_areas")
    .update({ name, zip_codes: zipCodes })
    .eq("id", serviceAreaId);
  if (error) return { error: error.message };

  await logAdminAction(supabase, gate.userId, "service_area_updated", "service_area", serviceAreaId, {
    name,
    zip_count: zipCodes.length,
  });

  revalidatePath("/admin/settings");
  return {};
}

// promotions grants admin full read+write via RLS too (promotions_admin_write,
// "for all using (is_admin(auth.uid()))" in 0011) — same normal per-request
// client as everything else on this page. The redemption-count/limit
// enforcement itself lives in the DB (enforce_promotion_limits trigger),
// not here — this is purely CRUD on the promotion definition.

function toOptionalDateTime(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toOptionalInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function createPromotion(formData: FormData): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const discountType = String(formData.get("discount_type") ?? "percent") as PromotionDiscountType;
  const discountValue = toInt(formData.get("discount_value"));
  const maxDiscountCents = toOptionalInt(formData.get("max_discount_cents"));
  const minSubtotalCents = toInt(formData.get("min_subtotal_cents"));
  const maxRedemptions = toOptionalInt(formData.get("max_redemptions"));
  const perUserLimit = toInt(formData.get("per_user_limit"), 1);
  const startsAt = toOptionalDateTime(formData.get("starts_at"));
  const expiresAt = toOptionalDateTime(formData.get("expires_at"));

  if (!code) return { error: "Code is required." };
  if (discountValue <= 0) return { error: "Discount value must be greater than zero." };
  if (discountType === "percent" && discountValue > 100) return { error: "Percent discount can't exceed 100." };
  if (perUserLimit <= 0) return { error: "Per-user limit must be at least 1." };
  if (startsAt && expiresAt && startsAt >= expiresAt) return { error: "Start date must be before expiry." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promotions")
    .insert({
      code,
      description: description || null,
      discount_type: discountType,
      discount_value: discountValue,
      max_discount_cents: maxDiscountCents,
      min_subtotal_cents: minSubtotalCents,
      max_redemptions: maxRedemptions,
      per_user_limit: perUserLimit,
      starts_at: startsAt,
      expires_at: expiresAt,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A promotion with that code already exists." };
    return { error: error.message };
  }

  await logAdminAction(supabase, gate.userId, "promotion_created", "promotion", data?.id ?? null, {
    code,
    discount_type: discountType,
    discount_value: discountValue,
  });

  revalidatePath("/admin/settings");
  return {};
}

export async function togglePromotionActive(promotionId: string, active: boolean): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("Admin only.");

  const supabase = await createClient();
  const { error } = await supabase.from("promotions").update({ active }).eq("id", promotionId);
  if (error) throw new Error(error.message);

  await logAdminAction(supabase, gate.userId, "promotion_toggled", "promotion", promotionId, { active });

  revalidatePath("/admin/settings");
}

// Deliberately does not let discount_type/discount_value be edited after
// creation — changing what a code is worth out from under redemptions that
// already happened is a business footgun, not a feature. To change the
// discount math, deactivate this code and create a new one.
export async function updatePromotion(promotionId: string, formData: FormData): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Admin only." };

  const description = String(formData.get("description") ?? "").trim();
  const maxDiscountCents = toOptionalInt(formData.get("max_discount_cents"));
  const minSubtotalCents = toInt(formData.get("min_subtotal_cents"));
  const maxRedemptions = toOptionalInt(formData.get("max_redemptions"));
  const perUserLimit = toInt(formData.get("per_user_limit"), 1);
  const startsAt = toOptionalDateTime(formData.get("starts_at"));
  const expiresAt = toOptionalDateTime(formData.get("expires_at"));

  if (perUserLimit <= 0) return { error: "Per-user limit must be at least 1." };
  if (startsAt && expiresAt && startsAt >= expiresAt) return { error: "Start date must be before expiry." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("promotions")
    .update({
      description: description || null,
      max_discount_cents: maxDiscountCents,
      min_subtotal_cents: minSubtotalCents,
      max_redemptions: maxRedemptions,
      per_user_limit: perUserLimit,
      starts_at: startsAt,
      expires_at: expiresAt,
    })
    .eq("id", promotionId);
  if (error) return { error: error.message };

  await logAdminAction(supabase, gate.userId, "promotion_updated", "promotion", promotionId, {
    max_discount_cents: maxDiscountCents,
    min_subtotal_cents: minSubtotalCents,
    max_redemptions: maxRedemptions,
    per_user_limit: perUserLimit,
  });

  revalidatePath("/admin/settings");
  return {};
}

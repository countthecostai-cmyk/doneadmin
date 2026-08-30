import { createClient } from "@/lib/supabase/server";
import { toggleCategoryActive, toggleTaskTypeActive, toggleServiceAreaActive } from "@/app/admin/settings/actions";
import { TaskTypeEditor } from "@/app/admin/settings/TaskTypeEditor";
import { NewCategoryForm } from "@/app/admin/settings/NewCategoryForm";
import { NewTaskTypeForm } from "@/app/admin/settings/NewTaskTypeForm";
import { NewServiceAreaForm } from "@/app/admin/settings/NewServiceAreaForm";
import { ServiceAreaEditor } from "@/app/admin/settings/ServiceAreaEditor";
import { formatCents } from "@/lib/pricing";
import type { Category, TaskType, ServiceArea } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const [{ data: categoriesData }, { data: taskTypesData }, { data: serviceAreasData }] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("task_types").select("*").order("sort_order"),
    supabase.from("service_areas").select("*").order("name"),
  ]);

  const categories = (categoriesData as Category[]) ?? [];
  const taskTypes = (taskTypesData as TaskType[]) ?? [];
  const serviceAreas = (serviceAreasData as ServiceArea[]) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Platform settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Categories and task types are data, not code — adding a new one here is all it takes.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-900">Categories</h2>
          <NewCategoryForm />
        </div>
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {categories.length === 0 && <p className="p-4 text-sm text-neutral-500">No categories yet.</p>}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-neutral-900">
                  {c.icon} {c.name} <span className="font-normal text-neutral-400">/{c.slug}</span>
                </p>
                {c.description && <p className="text-sm text-neutral-500">{c.description}</p>}
              </div>
              <form action={toggleCategoryActive.bind(null, c.id, !c.active)}>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    c.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {c.active ? "Active" : "Inactive"} — click to {c.active ? "deactivate" : "activate"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-900">Task types</h2>
          <NewTaskTypeForm categories={categories} />
        </div>
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {taskTypes.length === 0 && <p className="p-4 text-sm text-neutral-500">No task types yet.</p>}
          {taskTypes.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-neutral-900">
                    {t.name} <span className="font-normal text-neutral-400">/{t.slug}</span>
                  </p>
                  <p className="text-sm text-neutral-500">
                    {t.pricing_model} · base {formatCents(t.base_price_cents)} · min {formatCents(t.min_price_cents)}
                    {t.price_per_unit_cents != null &&
                      ` · ${formatCents(t.price_per_unit_cents)}/${t.unit_label ?? "unit"}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleTaskTypeActive.bind(null, t.id, !t.active)}>
                    <button
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        t.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {t.active ? "Active" : "Inactive"}
                    </button>
                  </form>
                </div>
              </div>
              <TaskTypeEditor taskType={t} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-neutral-900">Service areas</h2>
            <p className="text-sm text-neutral-500">
              {serviceAreas.filter((a) => a.active).length === 0
                ? "No active service areas configured — task requests are open to every ZIP code until you add one."
                : "Only ZIP codes covered by an active service area below can request a task."}
            </p>
          </div>
          <NewServiceAreaForm />
        </div>
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {serviceAreas.length === 0 && (
            <p className="p-4 text-sm text-neutral-500">No service areas yet.</p>
          )}
          {serviceAreas.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-neutral-900">{a.name}</p>
                  <p className="text-sm text-neutral-500">
                    {a.zip_codes.length} ZIP{a.zip_codes.length === 1 ? "" : "s"}: {a.zip_codes.join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleServiceAreaActive.bind(null, a.id, !a.active)}>
                    <button
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        a.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {a.active ? "Active" : "Inactive"}
                    </button>
                  </form>
                </div>
              </div>
              <ServiceAreaEditor serviceArea={a} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

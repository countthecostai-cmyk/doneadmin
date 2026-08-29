import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SuspendControl } from "@/app/admin/users/[id]/SuspendControl";
import { STATUS_LABELS } from "@/lib/task-state-machine";
import { formatCents } from "@/lib/pricing";
import type { DoerProfile, Profile, Task, TaskType } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type TaskWithType = Task & { task_types: Pick<TaskType, "name"> | null };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!profileData) notFound();
  const profile = profileData as Profile;

  const { data: doerProfileData } = await supabase
    .from("doer_profiles")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  const doerProfile = doerProfileData as DoerProfile | null;

  const [requestedTasks, doerTasks] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, task_types(name)")
      .eq("requester_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    doerProfile
      ? supabase
          .from("tasks")
          .select("*, task_types(name)")
          .eq("doer_id", id)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as TaskWithType[] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-neutral-500 hover:underline">
          ← All users
        </Link>
      </div>

      <div className="flex items-start justify-between rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-neutral-900">{profile.full_name ?? "(no name)"}</h1>
            {profile.is_admin && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
                ADMIN
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-500">{profile.phone ?? "No phone on file"}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Joined {new Date(profile.created_at).toLocaleDateString()} · id {profile.id}
          </p>
        </div>
        <SuspendControl userId={profile.id} isSuspended={profile.is_suspended} suspendedReason={profile.suspended_reason} />
      </div>

      {doerProfile && (
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Doer profile</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Work status" value={doerProfile.status} />
            <Stat label="Available now" value={doerProfile.is_available ? "Yes" : "No"} />
            <Stat label="Identity verified" value={doerProfile.identity_verified ? "Yes" : "No"} />
            <Stat label="Background check" value={doerProfile.background_check_status} />
            <Stat
              label="Rating"
              value={doerProfile.rating_avg ? `${doerProfile.rating_avg.toFixed(2)} (${doerProfile.rating_count})` : "No ratings yet"}
            />
            <Stat label="Applied" value={new Date(doerProfile.applied_at).toLocaleDateString()} />
            {doerProfile.suspended_reason && (
              <Stat label="Doer suspension note" value={doerProfile.suspended_reason} />
            )}
          </div>
          {doerProfile.bio && <p className="mt-4 text-sm text-neutral-600">{doerProfile.bio}</p>}
        </div>
      )}

      <TaskTable title="Requested tasks" tasks={(requestedTasks.data as TaskWithType[]) ?? []} />
      {doerProfile && <TaskTable title="Claimed tasks (as Doer)" tasks={(doerTasks.data as TaskWithType[]) ?? []} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="font-medium capitalize text-neutral-900">{value}</p>
    </div>
  );
}

function TaskTable({ title, tasks }: { title: string; tasks: TaskWithType[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">None yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/admin/tasks/${task.id}`}
                className="flex items-center justify-between py-2 text-sm hover:bg-neutral-50"
              >
                <span className="text-neutral-900">{task.task_types?.name ?? task.title}</span>
                <span className="flex items-center gap-3 text-neutral-500">
                  {formatCents(task.price_cents, task.currency)}
                  <span className="text-xs">{STATUS_LABELS[task.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

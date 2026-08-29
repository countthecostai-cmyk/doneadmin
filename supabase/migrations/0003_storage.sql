-- Completion photo proof storage.
-- Path convention: task-photos/{task_id}/{filename}
-- Only the assigned doer may upload (and only while they hold the task);
-- requester/doer/admin on that task may read. Private bucket, signed URLs.

insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', false)
on conflict (id) do nothing;

create policy task_photos_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-photos'
    and exists (
      select 1 from tasks t
      where t.id::text = (storage.foldername(name))[1]
        and t.doer_id = auth.uid()
    )
  );

create policy task_photos_select on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-photos'
    and (
      is_admin(auth.uid())
      or exists (
        select 1 from tasks t
        where t.id::text = (storage.foldername(name))[1]
          and (t.requester_id = auth.uid() or t.doer_id = auth.uid())
      )
    )
  );

create policy task_photos_admin_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'task-photos' and is_admin(auth.uid()));

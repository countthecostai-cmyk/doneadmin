-- Fixes a real gap found while wiring up the Done (customer) app's "rate the
-- Doer" flow: `reviews` rows can be inserted (0001) but nothing ever
-- recomputed `doer_profiles.rating_avg`/`rating_count` from them — those
-- columns are correctly locked to admin/system-only writes
-- (doer_profiles_lock_privileged_fields, 0002), but no system-side trigger
-- existed to actually perform that write. Without this, every Doer's
-- displayed rating would stay null/0 forever regardless of real reviews.

create or replace function reviews_recompute_doer_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.ratee_id, old.ratee_id);

  -- Only doers have a doer_profiles row / a rating to show; a review of a
  -- Requester (if that's ever allowed) has nothing to aggregate into.
  update doer_profiles
  set
    rating_avg = agg.avg_rating,
    rating_count = agg.review_count
  from (
    select
      avg(r.rating)::numeric(3, 2) as avg_rating,
      count(*) as review_count
    from reviews r
    where r.ratee_id = target_id
  ) agg
  where doer_profiles.user_id = target_id;

  return coalesce(new, old);
end;
$$;

create trigger reviews_recompute_doer_rating_trg
  after insert or update or delete on reviews
  for each row execute function reviews_recompute_doer_rating();

-- Backfill: recompute for any doer that already has reviews (defensive —
-- there won't be any pre-existing rows against a schema this new, but this
-- makes the migration correct to run against a database that already has
-- test data from before this trigger existed).
update doer_profiles dp
set
  rating_avg = agg.avg_rating,
  rating_count = agg.review_count
from (
  select ratee_id, avg(rating)::numeric(3, 2) as avg_rating, count(*) as review_count
  from reviews
  group by ratee_id
) agg
where dp.user_id = agg.ratee_id;

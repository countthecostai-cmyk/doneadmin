-- Expanded seed data — broadens the category/task-type catalog beyond the
-- single fully-built Car Wash Pickup path so the data-driven system (and
-- every pricing model it supports) has real breadth to prove itself
-- against. Nothing here requires a frontend code change to appear — see
-- 0004_seed.sql's comment and the "category list is data" rule in the
-- project instructions.
--
-- Deliberately exercises every pricing_model in the enum (flat, hourly,
-- quantity, distance, doer_quote, custom_quote, minimum_charge) so the
-- request flow, pricing preview, and compute_task_pricing() all get
-- coverage across the full matrix, not just the flat/car-wash path.

-- ============================================================================
-- ERRANDS — pickup/drop-off, waiting in line
-- ============================================================================

insert into task_types (
  category_id, slug, name, description, pricing_model,
  base_price_cents, min_price_cents, price_per_unit_cents, unit_label,
  requires_photo_proof, sort_order
)
select c.id, v.slug, v.name, v.description, v.pricing_model::pricing_model,
       v.base_price_cents, v.min_price_cents, v.price_per_unit_cents, v.unit_label,
       v.requires_photo_proof, v.sort_order
from categories c
join (values
  ('package-pickup-dropoff', 'Package Pickup / Drop-off', 'A Doer picks up or drops off a package for you.', 'flat', 1500, 1500, null::integer, null::text, true, 2),
  ('waiting-in-line', 'Waiting in Line', 'A Doer waits in line for you — DMV, restock drops, event tickets, and more.', 'hourly', 500, 1500, 1500, 'hour', false, 3),
  ('dry-cleaning-pickup', 'Dry Cleaning Pickup', 'A Doer picks up your dry cleaning and drops it at your door.', 'flat', 1200, 1200, null, null, true, 4),
  ('prescription-pickup', 'Prescription Pickup', 'A Doer picks up a prescription from the pharmacy for you.', 'flat', 1000, 1000, null, null, true, 5),
  ('local-delivery-run', 'Local Delivery Run', 'A Doer delivers or transports an item across town, priced by distance.', 'distance', 500, 800, 200, 'mile', true, 6)
) as v(slug, name, description, pricing_model, base_price_cents, min_price_cents, price_per_unit_cents, unit_label, requires_photo_proof, sort_order)
  on true
where c.slug = 'errands'
on conflict (slug) do nothing;

-- ============================================================================
-- LABOR — yard work, moving, junk removal
-- ============================================================================

insert into task_types (
  category_id, slug, name, description, pricing_model,
  base_price_cents, min_price_cents, price_per_unit_cents, unit_label,
  requires_photo_proof, sort_order
)
select c.id, v.slug, v.name, v.description, v.pricing_model::pricing_model,
       v.base_price_cents, v.min_price_cents, v.price_per_unit_cents, v.unit_label,
       v.requires_photo_proof, v.sort_order
from categories c
join (values
  ('yard-work', 'Yard Work', 'Mowing, weeding, raking, and general yard cleanup.', 'hourly', 0, 3500, 3500, 'hour', true, 1),
  ('moving-help', 'Moving Help', 'A Doer helps load, carry, and unload for your move.', 'hourly', 0, 8000, 4000, 'hour', true, 2),
  ('furniture-assembly', 'Furniture Assembly', 'A Doer assembles flat-pack or ready-to-assemble furniture.', 'quantity', 0, 2500, 2500, 'item', true, 3),
  ('junk-removal', 'Junk Removal', 'A Doer hauls away junk, old furniture, or debris. Final price is quoted on-site based on volume.', 'doer_quote', 4000, 4000, null, null, true, 4),
  ('deep-cleaning', 'Deep Cleaning', 'A thorough clean beyond a standard tidy-up.', 'hourly', 0, 6000, 3000, 'hour', true, 5),
  ('custom-labor-task', 'Custom / Other', 'Describe what you need — a Doer will confirm the price before starting.', 'custom_quote', 2000, 2000, null, null, false, 6)
) as v(slug, name, description, pricing_model, base_price_cents, min_price_cents, price_per_unit_cents, unit_label, requires_photo_proof, sort_order)
  on true
where c.slug = 'labor'
on conflict (slug) do nothing;

-- ============================================================================
-- PERSONAL TASKS — dog walking, groceries, and other on-demand personal tasks
-- ============================================================================

insert into task_types (
  category_id, slug, name, description, pricing_model,
  base_price_cents, min_price_cents, price_per_unit_cents, unit_label,
  requires_photo_proof, sort_order
)
select c.id, v.slug, v.name, v.description, v.pricing_model::pricing_model,
       v.base_price_cents, v.min_price_cents, v.price_per_unit_cents, v.unit_label,
       v.requires_photo_proof, v.sort_order
from categories c
join (values
  ('dog-walking', 'Dog Walking', 'A 30-minute walk for your dog.', 'flat', 2000, 2000, null::integer, null::text, false, 1),
  ('grocery-shopping', 'Grocery Shopping', 'A Doer shops your list and delivers it. Service fee only — groceries are reimbursed separately.', 'flat', 2500, 2500, null, null, true, 2),
  ('pet-sitting', 'Pet Sitting', 'In-home pet sitting, billed hourly.', 'hourly', 0, 4000, 2000, 'hour', false, 3),
  ('house-sitting', 'House Sitting', 'A Doer checks in on and watches your home while you are away.', 'quantity', 0, 6000, 6000, 'day', false, 4),
  ('plant-watering', 'Plant Watering', 'A one-time visit to water your plants.', 'flat', 1500, 1500, null, null, false, 5)
) as v(slug, name, description, pricing_model, base_price_cents, min_price_cents, price_per_unit_cents, unit_label, requires_photo_proof, sort_order)
  on true
where c.slug = 'personal-tasks'
on conflict (slug) do nothing;

-- ============================================================================
-- ADD-ONS — exercise task_type_addons + the addon total in compute_task_pricing
-- ============================================================================

insert into task_type_addons (task_type_id, name, price_cents, sort_order)
select t.id, v.name, v.price_cents, v.sort_order
from task_types t
join (values
  ('package-pickup-dropoff', 'Additional stop', 500, 1),
  ('moving-help', 'Additional mover', 2500, 1),
  ('moving-help', 'Stairs (3rd floor or higher)', 1500, 2),
  ('yard-work', 'Leaf bagging', 1000, 1),
  ('yard-work', 'Hedge trimming', 1500, 2),
  ('dog-walking', 'Additional dog', 1000, 1),
  ('grocery-shopping', 'Additional store stop', 800, 1)
) as v(task_type_slug, name, price_cents, sort_order)
  on v.task_type_slug = t.slug
where not exists (
  select 1 from task_type_addons a where a.task_type_id = t.id and a.name = v.name
);

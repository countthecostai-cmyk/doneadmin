-- Seed data — categories & task types are data, never a frontend switch
-- statement. This seeds the one fully-built path (Car Wash Pickup) plus a
-- few placeholder categories so the data-driven system has something to
-- prove itself against later.

insert into categories (slug, name, description, icon, sort_order) values
  ('errands', 'Errands', 'Pickup, drop-off, waiting in line, and other quick errands.', '🚗', 1),
  ('labor', 'Labor', 'Yard work, moving help, junk removal.', '💪', 2),
  ('personal-tasks', 'Personal Tasks', 'Dog walking, groceries, and other on-demand personal tasks.', '🐾', 3)
on conflict (slug) do nothing;

insert into task_types (
  category_id, slug, name, description, pricing_model,
  base_price_cents, min_price_cents, requires_photo_proof, sort_order
)
select
  c.id, 'car-wash-pickup', 'Car Wash Pickup',
  'A Doer picks up your car, takes it through a car wash, and returns it — done.',
  'flat', 3500, 3500, true, 1
from categories c where c.slug = 'errands'
on conflict (slug) do nothing;

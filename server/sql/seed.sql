-- Default rewards for this project.
-- title is currently the stable key for built-in rewards, not just display text.
-- Changing a title is treated as creating a new built-in reward.

INSERT INTO app_rewards (title, points_cost, category, image_url, is_active)
VALUES
  ('Make-up Card', 100, 'makeup_card', '', TRUE),
  ('Coffee Coupon', 120, 'drinks', '', TRUE),
  ('Latte Coupon', 160, 'drinks', '', TRUE),
  ('Discount Coupon', 200, 'coupon', '', TRUE),
  ('Big Discount Coupon', 260, 'coupon', '', TRUE)
ON CONFLICT (title) DO UPDATE
SET
  points_cost = EXCLUDED.points_cost,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  is_active = EXCLUDED.is_active;

-- Default rewards for this project.
-- title is currently the stable key for built-in rewards, not just display text.
-- Changing a title is treated as creating a new built-in reward.

UPDATE app_rewards
SET is_active = FALSE
WHERE title IN (
  'Coffee Coupon',
  'Latte Coupon',
  'Discount Coupon',
  'Big Discount Coupon'
);

INSERT INTO app_rewards (title, points_cost, category, image_url, is_active)
VALUES
  ('Bosta Coffee 25% Off', 120, 'coffee', '', TRUE),
  ('Bosta Coffee 50% Off', 220, 'coffee', '', TRUE),
  ('Free Bosta Coffee', 360, 'coffee', '', TRUE),
  ('School Cafeteria 25% Off', 150, 'daily_life', '', TRUE),
  ('School Cafeteria ' || CHR(163) || '2 Off ' || CHR(163) || '10', 180, 'daily_life', '', TRUE),
  ('School Cafeteria ' || CHR(163) || '5 Off ' || CHR(163) || '20', 340, 'daily_life', '', TRUE),
  ('Besco ' || CHR(163) || '2 Off ' || CHR(163) || '10', 180, 'daily_life', '', TRUE),
  ('Besco ' || CHR(163) || '5 Off ' || CHR(163) || '20', 340, 'daily_life', '', TRUE),
  ('Laundry 50% Off', 200, 'daily_life', '', TRUE),
  ('Campus Store 25% Off ' || CHR(163) || '5', 100, 'daily_life', '', TRUE),
  ('Campus Store 25% Off ' || CHR(163) || '10', 190, 'daily_life', '', TRUE),
  (CHR(163) || '3 Gift Voucher', 280, 'gift_voucher', '', TRUE),
  (CHR(163) || '5 Gift Voucher', 420, 'gift_voucher', '', TRUE),
  ('Make-up Card', 300, 'special', '', TRUE),
  ('Extra Draw Ticket', 100, 'special', '', TRUE),
  ('Reroll Ticket', 60, 'special', '', TRUE)
ON CONFLICT (title) DO UPDATE
SET
  points_cost = EXCLUDED.points_cost,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  is_active = EXCLUDED.is_active;

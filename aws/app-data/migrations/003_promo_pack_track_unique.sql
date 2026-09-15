WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY track_id ORDER BY created_at DESC, id DESC) AS row_number
  FROM promo_packs
  WHERE track_id IS NOT NULL
)
DELETE FROM promo_packs
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);
-- statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_packs_track_id_unique
ON promo_packs (track_id);

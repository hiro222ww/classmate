-- Non-destructive cleanup for legacy/hidden class memberships that inflate class_slots counts.
-- Run SELECT blocks first. DELETE only after manual review.

-- 1) Legacy memberships hidden from /api/class/mine but still in class_memberships
SELECT
  cm.device_id,
  cm.class_id,
  c.name,
  cm.joined_at
FROM public.class_memberships cm
JOIN public.classes c ON c.id = cm.class_id
WHERE c.name IN ('女子校', '男子校', 'フリークラス', 'ホームルーム')
   OR c.name LIKE 'フリークラス%'
   OR c.name LIKE '女子校%'
   OR c.name LIKE '男子校%'
   OR c.name LIKE 'ホームルーム%'
ORDER BY cm.device_id, cm.joined_at;

-- 2) Per-device summary (billable vs legacy)
SELECT
  cm.device_id,
  count(*) FILTER (
    WHERE NOT (
      c.name IN ('女子校', '男子校', 'フリークラス', 'ホームルーム')
      OR c.name LIKE 'フリークラス%'
      OR c.name LIKE '女子校%'
      OR c.name LIKE '男子校%'
      OR c.name LIKE 'ホームルーム%'
    )
  ) AS billable_count,
  count(*) FILTER (
    WHERE (
      c.name IN ('女子校', '男子校', 'フリークラス', 'ホームルーム')
      OR c.name LIKE 'フリークラス%'
      OR c.name LIKE '女子校%'
      OR c.name LIKE '男子校%'
      OR c.name LIKE 'ホームルーム%'
    )
  ) AS legacy_count,
  max(ue.class_slots) AS class_slots
FROM public.class_memberships cm
JOIN public.classes c ON c.id = cm.class_id
LEFT JOIN public.user_entitlements ue ON ue.device_id = cm.device_id
GROUP BY cm.device_id
HAVING count(*) FILTER (
  WHERE NOT (
    c.name IN ('女子校', '男子校', 'フリークラス', 'ホームルーム')
    OR c.name LIKE 'フリークラス%'
    OR c.name LIKE '女子校%'
    OR c.name LIKE '男子校%'
    OR c.name LIKE 'ホームルーム%'
  )
) < count(*)
ORDER BY legacy_count DESC;

-- 3) Optional cleanup: remove legacy memberships only (DESTRUCTIVE — review first)
-- DELETE FROM public.class_memberships cm
-- USING public.classes c
-- WHERE c.id = cm.class_id
--   AND (
--     c.name IN ('女子校', '男子校', 'フリークラス', 'ホームルーム')
--     OR c.name LIKE 'フリークラス%'
--     OR c.name LIKE '女子校%'
--     OR c.name LIKE '男子校%'
--     OR c.name LIKE 'ホームルーム%'
--   );

-- 4) Verify entitlements for a device
-- SELECT device_id, class_slots, plan FROM public.user_entitlements WHERE device_id = 'YOUR_DEVICE_ID';

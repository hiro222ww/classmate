-- DRAFT ONLY — do not apply to production from this agent run.
-- Live create_class / create_world / create_topic SQL bodies are not in the
-- application repository. Review the production function definitions first,
-- then fold an equivalent guard into each RPC (or replace with a wrapper).
--
-- Intended rule (must match lib/billingCatalog.ts / lib/classCreateGuards.ts):
--   can_create := COALESCE(ue.can_create_classes, false)
--                 OR COALESCE(ue.class_slots, 1) > 1
--                 OR COALESCE(ue.topic_plan, 0) > 0
--
-- Also force public creates:
--   p_is_sensitive := false
--   p_is_premium   := false
--   p_min_age      := GREATEST(p_min_age, 18)

-- Example guard snippet to place near the top of create_class(p_device_id ...):
/*
DECLARE
  v_can_create boolean := false;
BEGIN
  SELECT COALESCE(can_create_classes, false)
      OR COALESCE(class_slots, 1) > 1
      OR COALESCE(topic_plan, 0) > 0
    INTO v_can_create
  FROM public.user_entitlements
  WHERE device_id = p_device_id
  LIMIT 1;

  IF NOT COALESCE(v_can_create, false) THEN
    RAISE EXCEPTION 'create_permission_denied'
      USING ERRCODE = '42501',
            DETAIL = 'class create requires class_slots>1 or topic_plan>0';
  END IF;

  IF COALESCE(p_min_age, 0) < 18 THEN
    RAISE EXCEPTION 'min_age_too_low'
      USING ERRCODE = '22023',
            DETAIL = 'min_age must be >= 18';
  END IF;

  -- Ignore client spoofing for public create entrypoints:
  p_is_sensitive := false;
  p_is_premium := false;

  -- ... existing create_class body ...
END;
*/

-- Same entitlement check should be applied to create_world and create_topic.

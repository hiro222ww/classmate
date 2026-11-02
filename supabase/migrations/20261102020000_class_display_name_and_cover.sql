-- Classmate: member-editable class display name + cover image.
-- DO NOT apply to production without explicit operator approval.
--
-- Keeps classes.name as the system/serial identifier.
-- Invite links continue to use classes.id (UUID).
-- Call/room sunset hero remains a separate static brand asset.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS display_name text NULL;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS cover_path text NULL;

COMMENT ON COLUMN public.classes.display_name IS
  'User-facing class title. When null/blank, clients fall back to classes.name.';

COMMENT ON COLUMN public.classes.cover_path IS
  'Storage object key in bucket class-covers (not the call hero background).';

-- Member-gated update: only display_name + cover_path; never touches id/name.
CREATE OR REPLACE FUNCTION public.update_class_presentation(
  p_device_id text,
  p_class_id uuid,
  p_display_name text DEFAULT NULL,
  p_cover_path text DEFAULT NULL,
  p_clear_cover boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text := NULLIF(btrim(COALESCE(p_device_id, '')), '');
  v_class_id uuid := p_class_id;
  v_display text := NULLIF(btrim(COALESCE(p_display_name, '')), '');
  v_cover text := NULLIF(btrim(COALESCE(p_cover_path, '')), '');
  v_member boolean := false;
  v_name text;
  v_display_out text;
  v_cover_out text;
BEGIN
  IF v_device_id IS NULL OR v_class_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.class_memberships cm
    WHERE cm.class_id = v_class_id
      AND cm.device_id = v_device_id
  )
  INTO v_member;

  IF NOT v_member THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_member');
  END IF;

  IF v_display IS NOT NULL AND char_length(v_display) > 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'display_name_too_long');
  END IF;

  UPDATE public.classes c
  SET
    display_name = CASE
      WHEN p_display_name IS NULL THEN c.display_name
      ELSE v_display
    END,
    cover_path = CASE
      WHEN p_clear_cover THEN NULL
      WHEN p_cover_path IS NULL THEN c.cover_path
      ELSE v_cover
    END
  WHERE c.id = v_class_id;

  SELECT c.name, c.display_name, c.cover_path
  INTO v_name, v_display_out, v_cover_out
  FROM public.classes c
  WHERE c.id = v_class_id;

  RETURN jsonb_build_object(
    'ok', true,
    'class_id', v_class_id,
    'name', v_name,
    'display_name', v_display_out,
    'cover_path', v_cover_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_class_presentation(text, uuid, text, text, boolean)
  TO service_role;

-- Storage bucket `class-covers` must be created in the Supabase dashboard
-- (public read, service-role write) before cover uploads are enabled.
-- Suggested path layout: {class_id}/{timestamp}.{ext}

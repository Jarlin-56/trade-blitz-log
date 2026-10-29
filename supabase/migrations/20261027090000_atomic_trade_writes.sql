-- Atomic trade writes. These functions are additive so existing clients can continue
-- to use the original tables while newer clients get all-or-nothing writes.
-- Storage public URLs bypass SELECT policies; actually make the bucket private.
UPDATE storage.buckets SET public = false WHERE id = 'trade-images';

CREATE OR REPLACE FUNCTION public.save_trade_with_relations(
  p_trade_id uuid,
  p_profile_id uuid,
  p_trade jsonb,
  p_condition_ids uuid[] DEFAULT '{}',
  p_tag_ids uuid[] DEFAULT '{}',
  p_metric_values jsonb DEFAULT '[]'
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trade_id uuid;
  v_user_id uuid := auth.uid();
  v_note_id uuid := NULLIF(p_trade->>'quick_note_id', '')::uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF v_note_id IS NOT NULL THEN
    PERFORM 1 FROM quick_notes WHERE id = v_note_id AND user_id = v_user_id AND profile_id = p_profile_id AND converted_trade_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quick note is unavailable or already converted'; END IF;
  END IF;
  IF p_trade IS NULL OR p_metric_values IS NULL OR p_condition_ids IS NULL OR p_tag_ids IS NULL
     OR jsonb_typeof(p_trade) <> 'object' OR jsonb_typeof(p_metric_values) <> 'array' THEN
    RAISE EXCEPTION 'Invalid trade payload';
  END IF;
  IF COALESCE(trim(p_trade->>'asset'), '') = '' OR length(p_trade->>'asset') > 32
     OR p_trade->>'direction' IS NULL OR p_trade->>'result' IS NULL OR p_trade->>'entry_date' IS NULL THEN
    RAISE EXCEPTION 'Required trade fields are missing or invalid';
  END IF;
  IF (p_trade->>'earned_r')::numeric::text IN ('NaN', 'Infinity', '-Infinity')
     OR (p_trade->>'missed_r')::numeric::text IN ('NaN', 'Infinity', '-Infinity')
     OR COALESCE((p_trade->>'duration_minutes')::integer, 0) < 0
     OR (p_trade->>'result' = 'Win' AND COALESCE((p_trade->>'earned_r')::numeric, 0) <= 0)
     OR (p_trade->>'result' = 'Missed' AND COALESCE((p_trade->>'missed_r')::numeric, 0) <= 0) THEN
    RAISE EXCEPTION 'Invalid R value or duration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_metric_values) AS v(metric_id uuid, value numeric)
    LEFT JOIN trade_metrics m ON m.id = v.metric_id
    WHERE v.value IS NULL OR v.value::text IN ('NaN', 'Infinity', '-Infinity')
       OR v.value < m.min_value OR v.value > m.max_value
  ) THEN RAISE EXCEPTION 'Metric value is outside the allowed range'; END IF;
  IF cardinality(p_condition_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_condition_ids) AS id)
     OR cardinality(p_tag_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_tag_ids) AS id) THEN
    RAISE EXCEPTION 'Duplicate relation identifiers are not allowed';
  END IF;
  IF (SELECT count(*) FROM conditions WHERE id = ANY(p_condition_ids) AND user_id = v_user_id) <> cardinality(p_condition_ids)
     OR (SELECT count(*) FROM tags WHERE id = ANY(p_tag_ids) AND user_id = v_user_id) <> cardinality(p_tag_ids) THEN
    RAISE EXCEPTION 'A selected condition or tag is not owned by this user';
  END IF;
  IF (SELECT count(DISTINCT metric_id) FROM jsonb_to_recordset(p_metric_values) AS m(metric_id uuid, value numeric)) <> jsonb_array_length(p_metric_values)
     OR (SELECT count(*) FROM trade_metrics WHERE id IN (SELECT metric_id FROM jsonb_to_recordset(p_metric_values) AS m(metric_id uuid, value numeric)) AND user_id = v_user_id AND profile_id = p_profile_id)
        <> jsonb_array_length(p_metric_values) THEN
    RAISE EXCEPTION 'A selected metric is invalid for this profile';
  END IF;

  IF p_trade_id IS NULL THEN
    INSERT INTO trades (user_id, profile_id, asset, direction, entry_date, result, earned_r, missed_r, duration_minutes, recap_text, image_url)
    VALUES (
      v_user_id, p_profile_id, upper(trim(p_trade->>'asset')), (p_trade->>'direction')::trade_direction,
      (p_trade->>'entry_date')::timestamptz, (p_trade->>'result')::trade_result,
      COALESCE((p_trade->>'earned_r')::numeric, 0), COALESCE((p_trade->>'missed_r')::numeric, 0),
      NULLIF(p_trade->>'duration_minutes', '')::integer, NULLIF(p_trade->>'recap_text', ''), NULLIF(p_trade->>'image_url', '')
    ) RETURNING id INTO v_trade_id;
  ELSE
    UPDATE trades SET
      asset = upper(trim(p_trade->>'asset')), direction = (p_trade->>'direction')::trade_direction,
      entry_date = (p_trade->>'entry_date')::timestamptz, result = (p_trade->>'result')::trade_result,
      earned_r = COALESCE((p_trade->>'earned_r')::numeric, 0), missed_r = COALESCE((p_trade->>'missed_r')::numeric, 0),
      duration_minutes = NULLIF(p_trade->>'duration_minutes', '')::integer, recap_text = NULLIF(p_trade->>'recap_text', ''),
      image_url = NULLIF(p_trade->>'image_url', '')
    WHERE id = p_trade_id AND user_id = v_user_id AND profile_id = p_profile_id
    RETURNING id INTO v_trade_id;
    IF v_trade_id IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  END IF;

  DELETE FROM trade_conditions WHERE trade_id = v_trade_id;
  DELETE FROM trade_tags WHERE trade_id = v_trade_id;
  DELETE FROM trade_metric_values WHERE trade_id = v_trade_id;
  INSERT INTO trade_conditions (trade_id, condition_id) SELECT v_trade_id, id FROM unnest(p_condition_ids) AS id;
  INSERT INTO trade_tags (trade_id, tag_id) SELECT v_trade_id, id FROM unnest(p_tag_ids) AS id;
  INSERT INTO trade_metric_values (user_id, trade_id, metric_id, value)
  SELECT v_user_id, v_trade_id, metric_id, value FROM jsonb_to_recordset(p_metric_values) AS m(metric_id uuid, value numeric);
  IF v_note_id IS NOT NULL THEN
    UPDATE quick_notes SET converted_trade_id = v_trade_id WHERE id = v_note_id;
  END IF;
  RETURN v_trade_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_trade_with_relations(
  p_profile_id uuid, p_trade jsonb, p_condition_ids uuid[] DEFAULT '{}', p_tag_ids uuid[] DEFAULT '{}', p_metric_values jsonb DEFAULT '[]'
) RETURNS uuid LANGUAGE sql SET search_path = public AS $$
  SELECT save_trade_with_relations(NULL, p_profile_id, p_trade, p_condition_ids, p_tag_ids, p_metric_values);
$$;

CREATE OR REPLACE FUNCTION public.update_trade_with_relations(
  p_trade_id uuid, p_profile_id uuid, p_trade jsonb, p_condition_ids uuid[] DEFAULT '{}', p_tag_ids uuid[] DEFAULT '{}', p_metric_values jsonb DEFAULT '[]'
) RETURNS uuid LANGUAGE sql SET search_path = public AS $$
  SELECT save_trade_with_relations(p_trade_id, p_profile_id, p_trade, p_condition_ids, p_tag_ids, p_metric_values);
$$;

REVOKE ALL ON FUNCTION public.save_trade_with_relations(uuid, uuid, jsonb, uuid[], uuid[], jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_trade_with_relations(uuid, uuid, jsonb, uuid[], uuid[], jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_trade_with_relations(uuid, jsonb, uuid[], uuid[], jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.update_trade_with_relations(uuid, uuid, jsonb, uuid[], uuid[], jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trade_with_relations(uuid, jsonb, uuid[], uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trade_with_relations(uuid, uuid, jsonb, uuid[], uuid[], jsonb) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_trades_user_profile_entry_date ON public.trades (user_id, profile_id, entry_date DESC);
-- Existing UNIQUE(trade_id, related_id) indexes already cover the trade side.
CREATE INDEX IF NOT EXISTS idx_trade_conditions_condition_trade ON public.trade_conditions (condition_id, trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_tags_tag_trade ON public.trade_tags (tag_id, trade_id);

CREATE OR REPLACE FUNCTION public.import_trades_with_relations(p_profile_id uuid, p_rows jsonb)
RETURNS uuid[] LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_row jsonb;
  v_ids uuid[] := '{}';
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Import requires between 1 and 1000 rows';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_ids := array_append(v_ids, public.create_trade_with_relations(p_profile_id, v_row->'trade', '{}', '{}', COALESCE(v_row->'metric_values', '[]')));
  END LOOP;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.import_trades_with_relations(uuid, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_trades_with_relations(uuid, jsonb) TO authenticated;

-- Preserve existing permissive ownership policies and additionally validate both
-- ends of relationships, including writes made by older clients directly to tables.
DROP POLICY IF EXISTS "Validate trade profile ownership" ON public.trades;
CREATE POLICY "Validate trade profile ownership" ON public.trades AS RESTRICTIVE
FOR ALL TO authenticated
USING (profile_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = trades.profile_id AND p.user_id = auth.uid()))
WITH CHECK (profile_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = trades.profile_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Validate metric profile ownership" ON public.trade_metrics;
CREATE POLICY "Validate metric profile ownership" ON public.trade_metrics AS RESTRICTIVE
FOR ALL TO authenticated
USING (profile_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = trade_metrics.profile_id AND p.user_id = auth.uid()))
WITH CHECK (profile_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = trade_metrics.profile_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Validate condition ownership" ON public.trade_conditions;
CREATE POLICY "Validate condition ownership" ON public.trade_conditions AS RESTRICTIVE
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM conditions c WHERE c.id = condition_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM conditions c WHERE c.id = condition_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Validate tag ownership" ON public.trade_tags;
CREATE POLICY "Validate tag ownership" ON public.trade_tags AS RESTRICTIVE
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM tags t WHERE t.id = tag_id AND t.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM tags t WHERE t.id = tag_id AND t.user_id = auth.uid()));

DROP POLICY IF EXISTS "Validate metric value ownership" ON public.trade_metric_values;
CREATE POLICY "Validate metric value ownership" ON public.trade_metric_values AS RESTRICTIVE
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM trades t JOIN trade_metrics m ON m.profile_id IS NOT DISTINCT FROM t.profile_id
  WHERE t.id = trade_id AND m.id = metric_id AND t.user_id = auth.uid() AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM trades t JOIN trade_metrics m ON m.profile_id IS NOT DISTINCT FROM t.profile_id
  WHERE t.id = trade_id AND m.id = metric_id AND t.user_id = auth.uid() AND m.user_id = auth.uid()));

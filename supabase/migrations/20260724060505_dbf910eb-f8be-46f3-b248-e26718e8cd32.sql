
CREATE TABLE public.quick_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  profile_id uuid,
  asset text,
  direction text CHECK (direction IN ('Long','Short')),
  note text,
  image_url text,
  converted_trade_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_notes TO authenticated;
GRANT ALL ON public.quick_notes TO service_role;

ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own quick notes"
  ON public.quick_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_quick_notes_updated_at
  BEFORE UPDATE ON public.quick_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX quick_notes_user_profile_idx ON public.quick_notes(user_id, profile_id, created_at DESC);

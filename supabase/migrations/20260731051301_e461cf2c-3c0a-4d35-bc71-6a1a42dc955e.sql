-- 1) clean orphan rows referencing deleted profiles
DELETE FROM public.recap_quiz_condition_results r
WHERE r.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.profile_id);
DELETE FROM public.recap_quiz_attempts a
WHERE a.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.profile_id);
DELETE FROM public.quick_notes q
WHERE q.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = q.profile_id);
DELETE FROM public.trades t
WHERE t.profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.profile_id);
DELETE FROM public.recap_quiz_condition_results r
WHERE NOT EXISTS (SELECT 1 FROM public.recap_quiz_attempts a WHERE a.id = r.attempt_id);
DELETE FROM public.trade_conditions tc
WHERE NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.id = tc.trade_id);
DELETE FROM public.trade_tags tt
WHERE NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.id = tt.trade_id);
DELETE FROM public.recap_quiz_attempts a
WHERE NOT EXISTS (SELECT 1 FROM public.trades t WHERE t.id = a.trade_id);

-- 2) cascade foreign keys
ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_profile_id_fkey,
  ADD CONSTRAINT trades_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.quick_notes
  DROP CONSTRAINT IF EXISTS quick_notes_profile_id_fkey,
  ADD CONSTRAINT quick_notes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.recap_quiz_attempts
  DROP CONSTRAINT IF EXISTS recap_quiz_attempts_profile_id_fkey,
  ADD CONSTRAINT recap_quiz_attempts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.recap_quiz_attempts
  DROP CONSTRAINT IF EXISTS recap_quiz_attempts_trade_id_fkey,
  ADD CONSTRAINT recap_quiz_attempts_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE;

ALTER TABLE public.recap_quiz_condition_results
  DROP CONSTRAINT IF EXISTS recap_quiz_condition_results_profile_id_fkey,
  ADD CONSTRAINT recap_quiz_condition_results_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.recap_quiz_condition_results
  DROP CONSTRAINT IF EXISTS recap_quiz_condition_results_attempt_id_fkey,
  ADD CONSTRAINT recap_quiz_condition_results_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.recap_quiz_attempts(id) ON DELETE CASCADE;

ALTER TABLE public.trade_conditions
  DROP CONSTRAINT IF EXISTS trade_conditions_trade_id_fkey,
  ADD CONSTRAINT trade_conditions_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE;

ALTER TABLE public.trade_tags
  DROP CONSTRAINT IF EXISTS trade_tags_trade_id_fkey,
  ADD CONSTRAINT trade_tags_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE;

-- 3) restrict chart image reads to the owning user
DROP POLICY IF EXISTS "Trade images are publicly accessible" ON storage.objects;
CREATE POLICY "Users can read own trade images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own trade images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);
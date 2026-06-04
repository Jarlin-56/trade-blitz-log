CREATE TABLE public.recap_quiz_condition_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.recap_quiz_attempts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  profile_id UUID,
  condition_name TEXT NOT NULL,
  guessed BOOLEAN NOT NULL DEFAULT false,
  actual BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recap_quiz_condition_results TO authenticated;
GRANT ALL ON public.recap_quiz_condition_results TO service_role;

ALTER TABLE public.recap_quiz_condition_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own quiz condition results"
ON public.recap_quiz_condition_results
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_quiz_cond_results_profile ON public.recap_quiz_condition_results (profile_id);
CREATE INDEX idx_quiz_cond_results_attempt ON public.recap_quiz_condition_results (attempt_id);
CREATE TABLE public.recap_quiz_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_id UUID,
  trade_id UUID NOT NULL,
  guess_enter BOOLEAN NOT NULL,
  guess_direction TEXT,
  direction_correct BOOLEAN NOT NULL DEFAULT false,
  enter_correct BOOLEAN NOT NULL DEFAULT false,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recap_quiz_attempts TO authenticated;
GRANT ALL ON public.recap_quiz_attempts TO service_role;

ALTER TABLE public.recap_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own quiz attempts"
ON public.recap_quiz_attempts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_recap_quiz_user ON public.recap_quiz_attempts (user_id, profile_id);
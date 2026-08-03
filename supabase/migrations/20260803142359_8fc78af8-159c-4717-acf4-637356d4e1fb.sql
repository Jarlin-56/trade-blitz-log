GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conditions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_conditions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recap_quiz_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recap_quiz_condition_results TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.trades TO service_role;
GRANT ALL ON public.conditions TO service_role;
GRANT ALL ON public.tags TO service_role;
GRANT ALL ON public.trade_conditions TO service_role;
GRANT ALL ON public.trade_tags TO service_role;
GRANT ALL ON public.quick_notes TO service_role;
GRANT ALL ON public.recap_quiz_attempts TO service_role;
GRANT ALL ON public.recap_quiz_condition_results TO service_role;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
CREATE TABLE public.trade_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text,
  decimals integer NOT NULL DEFAULT 2,
  min_value numeric,
  max_value numeric,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_metrics TO authenticated;
GRANT ALL ON public.trade_metrics TO service_role;
ALTER TABLE public.trade_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade_metrics" ON public.trade_metrics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_trade_metrics_updated_at BEFORE UPDATE ON public.trade_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.trade_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.trade_metrics(id) ON DELETE CASCADE,
  value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, metric_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_metric_values TO authenticated;
GRANT ALL ON public.trade_metric_values TO service_role;
ALTER TABLE public.trade_metric_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade_metric_values" ON public.trade_metric_values FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_trade_metric_values_updated_at BEFORE UPDATE ON public.trade_metric_values FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_trade_metric_values_trade ON public.trade_metric_values(trade_id);
CREATE INDEX idx_trade_metric_values_metric ON public.trade_metric_values(metric_id);
CREATE INDEX idx_trade_metrics_profile ON public.trade_metrics(profile_id);
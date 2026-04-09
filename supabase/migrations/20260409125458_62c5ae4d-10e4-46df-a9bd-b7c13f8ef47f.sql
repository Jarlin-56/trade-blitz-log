
-- Create enums
CREATE TYPE public.trade_direction AS ENUM ('Long', 'Short');
CREATE TYPE public.trade_result AS ENUM ('Win', 'Loss', 'Break-even');

-- Conditions master list
CREATE TABLE public.conditions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conditions" ON public.conditions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tags master list
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trades
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  direction trade_direction NOT NULL,
  entry_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  result trade_result NOT NULL,
  earned_r NUMERIC NOT NULL DEFAULT 0,
  recap_text TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trades" ON public.trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trade-Conditions many-to-many
CREATE TABLE public.trade_conditions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  condition_id UUID NOT NULL REFERENCES public.conditions(id) ON DELETE CASCADE,
  UNIQUE(trade_id, condition_id)
);
ALTER TABLE public.trade_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade_conditions" ON public.trade_conditions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_conditions.trade_id AND trades.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_conditions.trade_id AND trades.user_id = auth.uid()));

-- Trade-Tags many-to-many
CREATE TABLE public.trade_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(trade_id, tag_id)
);
ALTER TABLE public.trade_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade_tags" ON public.trade_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid()));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for chart images
INSERT INTO storage.buckets (id, name, public) VALUES ('trade-images', 'trade-images', true);
CREATE POLICY "Users can upload trade images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Trade images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'trade-images');
CREATE POLICY "Users can delete own trade images" ON storage.objects FOR DELETE USING (bucket_id = 'trade-images' AND auth.uid()::text = (storage.foldername(name))[1]);

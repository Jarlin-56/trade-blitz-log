
-- Add new enum values
ALTER TYPE public.trade_result ADD VALUE IF NOT EXISTS 'Missed';
ALTER TYPE public.trade_result ADD VALUE IF NOT EXISTS 'Canceled';

-- Add missed_r column
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS missed_r numeric NOT NULL DEFAULT 0;

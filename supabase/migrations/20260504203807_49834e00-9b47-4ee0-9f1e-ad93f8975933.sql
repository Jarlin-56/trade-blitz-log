-- Remove unique constraint on profiles.user_id
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;

-- Add is_active column
ALTER TABLE public.profiles ADD COLUMN is_active boolean NOT NULL DEFAULT false;

-- Add profile_id to trades
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.trades ADD COLUMN profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Set existing profiles to active
UPDATE public.profiles SET is_active = true;

-- Backfill profile_id on existing trades
UPDATE public.trades t
SET profile_id = (
  SELECT p.id FROM public.profiles p WHERE p.user_id = t.user_id LIMIT 1
);

-- Update the handle_new_user function to set is_active = true for first profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, is_active)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), true);
  RETURN NEW;
END;
$$;
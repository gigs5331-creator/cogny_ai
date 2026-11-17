
DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('university', 'high_school');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type public.account_type NOT NULL DEFAULT 'university';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, student_number, university, program, account_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'student_number',
    NEW.raw_user_meta_data->>'university',
    NEW.raw_user_meta_data->>'program',
    COALESCE((NEW.raw_user_meta_data->>'account_type')::public.account_type, 'university')
  );
  RETURN NEW;
END;
$$;

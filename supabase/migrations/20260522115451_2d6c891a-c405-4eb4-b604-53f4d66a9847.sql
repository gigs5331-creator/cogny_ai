
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS course_name TEXT;
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS shared_with_program BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_user_program(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT program FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

DROP POLICY IF EXISTS "View own or public decks" ON public.decks;
CREATE POLICY "View own, public, or program-shared decks"
ON public.decks FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR is_public = true
  OR (
    shared_with_program = true
    AND public.get_user_program(user_id) IS NOT NULL
    AND public.get_user_program(user_id) = public.get_user_program(auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.get_program_shared_decks()
RETURNS TABLE (
  id uuid,
  title text,
  subject text,
  course_name text,
  created_at timestamptz,
  user_id uuid,
  sharer_name text,
  card_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.title, d.subject, d.course_name, d.created_at, d.user_id,
         COALESCE(p.display_name, 'Student') AS sharer_name,
         (SELECT COUNT(*) FROM public.flashcards f WHERE f.deck_id = d.id) AS card_count
  FROM public.decks d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.shared_with_program = true
    AND d.user_id <> auth.uid()
    AND public.get_user_program(d.user_id) IS NOT NULL
    AND public.get_user_program(d.user_id) = public.get_user_program(auth.uid())
  ORDER BY d.created_at DESC
  LIMIT 100;
$$;

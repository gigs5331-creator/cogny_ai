
-- 1) Restrict profiles SELECT to owner only
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2) Public-safe view exposing only non-sensitive fields
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, display_name, university
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- 3) Allow program peers to view flashcards in program-shared decks
DROP POLICY IF EXISTS "View cards of accessible decks" ON public.flashcards;

CREATE POLICY "View cards of accessible decks"
ON public.flashcards FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = flashcards.deck_id
      AND (
        d.is_public = true
        OR (
          d.shared_with_program = true
          AND public.get_user_program(d.user_id) IS NOT NULL
          AND public.get_user_program(d.user_id) = public.get_user_program(auth.uid())
        )
      )
  )
);

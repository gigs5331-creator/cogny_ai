CREATE OR REPLACE FUNCTION public.search_decks_by_program(p_query text)
RETURNS TABLE(
  id uuid, title text, subject text, course_name text,
  created_at timestamp with time zone, user_id uuid,
  sharer_name text, program text, card_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.title, d.subject, d.course_name, d.created_at, d.user_id,
         COALESCE(p.display_name, 'Student') AS sharer_name,
         p.program,
         (SELECT COUNT(*) FROM public.flashcards f WHERE f.deck_id = d.id) AS card_count
  FROM public.decks d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE (d.shared_with_program = true OR d.is_public = true)
    AND d.user_id <> auth.uid()
    AND p.program IS NOT NULL
    AND (
      p_query IS NULL OR p_query = '' OR
      p.program ILIKE '%' || p_query || '%'
    )
  ORDER BY d.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.search_decks_by_program(text) TO authenticated;

-- Allow viewing decks shared via this search (program-shared regardless of viewer's program)
DROP POLICY IF EXISTS "View own, public, or program-shared decks" ON public.decks;
CREATE POLICY "View own, public, or program-shared decks"
ON public.decks FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR is_public = true
  OR shared_with_program = true
);

DROP POLICY IF EXISTS "View cards of accessible decks" ON public.flashcards;
CREATE POLICY "View cards of accessible decks"
ON public.flashcards FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = flashcards.deck_id
      AND (d.is_public = true OR d.shared_with_program = true)
  )
);
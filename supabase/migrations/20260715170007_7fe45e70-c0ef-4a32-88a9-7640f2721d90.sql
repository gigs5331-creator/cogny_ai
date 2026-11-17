CREATE OR REPLACE FUNCTION public.search_decks_by_program(p_query text)
RETURNS TABLE (
  id uuid, title text, subject text, course_name text, created_at timestamptz,
  user_id uuid, sharer_name text, program text, card_count bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.title, d.subject, d.course_name, d.created_at, d.user_id,
    COALESCE(p.display_name, 'Anonymous') AS sharer_name,
    p.program,
    (SELECT count(*) FROM public.flashcards f WHERE f.deck_id = d.id) AS card_count
  FROM public.decks d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE d.archived_at IS NULL
    AND (d.is_public = true OR d.shared_with_program = true)
    AND (
      p_query IS NULL OR length(trim(p_query)) = 0
      OR p.program ILIKE '%' || p_query || '%'
      OR d.title ILIKE '%' || p_query || '%'
      OR d.subject ILIKE '%' || p_query || '%'
      OR d.course_name ILIKE '%' || p_query || '%'
    )
  ORDER BY d.created_at DESC
  LIMIT 60;
$$;

GRANT EXECUTE ON FUNCTION public.search_decks_by_program(text) TO authenticated, anon;
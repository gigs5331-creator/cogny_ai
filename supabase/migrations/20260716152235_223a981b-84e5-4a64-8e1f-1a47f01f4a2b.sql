
GRANT SELECT ON public.decks TO anon;
GRANT SELECT ON public.flashcards TO anon;

CREATE POLICY "Anon can view public or program-shared decks"
ON public.decks FOR SELECT TO anon
USING (is_public = true OR shared_with_program = true);

CREATE POLICY "Anon can view cards of public or shared decks"
ON public.flashcards FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.decks d
  WHERE d.id = flashcards.deck_id
    AND (d.is_public = true OR d.shared_with_program = true)
));

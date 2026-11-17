
REVOKE EXECUTE ON FUNCTION public.get_user_program(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_program_shared_decks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_program_shared_decks() TO authenticated;

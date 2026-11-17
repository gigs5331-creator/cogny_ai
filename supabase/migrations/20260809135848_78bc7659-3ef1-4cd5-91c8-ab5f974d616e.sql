ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'short_answer',
  ADD COLUMN IF NOT EXISTS options jsonb;

ALTER TABLE public.flashcards
  ADD CONSTRAINT flashcards_question_type_check
  CHECK (question_type IN ('multiple_choice','true_false','short_answer','numerical','essay'));
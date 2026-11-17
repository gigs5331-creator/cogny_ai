-- 1. Update leaderboard: rank by total correct answers, top 10
CREATE OR REPLACE FUNCTION public.get_leaderboard()
 RETURNS TABLE(user_id uuid, display_name text, university text, mastered_count bigint, avg_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS user_id,
    COALESCE(p.display_name, 'Student') AS display_name,
    p.university,
    COALESCE(s.total_correct, 0) AS mastered_count,
    COALESCE(s.avg_score, 0) AS avg_score
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id,
           SUM(score)::bigint AS total_correct,
           ROUND(AVG(CASE WHEN total > 0 THEN (score::numeric / total) * 100 ELSE 0 END), 0) AS avg_score
    FROM public.study_sessions
    GROUP BY user_id
  ) s ON s.user_id = p.id
  WHERE COALESCE(s.total_correct, 0) > 0
  ORDER BY COALESCE(s.total_correct, 0) DESC, COALESCE(s.avg_score, 0) DESC
  LIMIT 10;
$function$;

-- 2. Program chat
CREATE TABLE IF NOT EXISTS public.program_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program text NOT NULL,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS program_messages_program_created_idx
  ON public.program_messages (program, created_at DESC);

ALTER TABLE public.program_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View messages in own program"
  ON public.program_messages FOR SELECT
  TO authenticated
  USING (program = public.get_user_program(auth.uid()));

CREATE POLICY "Post messages in own program"
  ON public.program_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND program = public.get_user_program(auth.uid())
    AND program IS NOT NULL
  );

CREATE POLICY "Delete own messages"
  ON public.program_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.program_messages;
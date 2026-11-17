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
  ORDER BY COALESCE(s.total_correct, 0) DESC, COALESCE(s.avg_score, 0) DESC
  LIMIT 10;
$function$;

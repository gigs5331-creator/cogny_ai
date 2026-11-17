
CREATE OR REPLACE FUNCTION public.get_leaderboard()
 RETURNS TABLE(user_id uuid, display_name text, university text, mastered_count bigint, avg_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH real_rows AS (
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
    LIMIT 10
  ),
  demos AS (
    SELECT * FROM (VALUES
      ('Amahle Dlamini'::text, 'University of Cape Town'::text, 184::bigint, 92::numeric),
      ('Liam van der Merwe', 'Stellenbosch University', 162, 88),
      ('Naledi Mokoena', 'University of the Witwatersrand', 148, 86),
      ('Thando Ngcobo', 'University of Pretoria', 131, 84),
      ('Aisha Patel', 'University of Johannesburg', 119, 81),
      ('Sipho Khumalo', 'Rhodes University', 104, 79),
      ('Chloe Botha', 'University of KwaZulu-Natal', 92, 77),
      ('Kabelo Mahlangu', 'North-West University', 81, 75),
      ('Zanele Nkosi', 'Nelson Mandela University', 70, 73),
      ('Ethan Pretorius', 'University of the Free State', 58, 70)
    ) AS t(display_name, university, mastered_count, avg_score)
  ),
  numbered_demos AS (
    SELECT
      ('00000000-0000-0000-0000-' || lpad(row_number() OVER ()::text, 12, '0'))::uuid AS user_id,
      display_name, university, mastered_count, avg_score
    FROM demos
  ),
  combined AS (
    SELECT * FROM real_rows
    UNION ALL
    SELECT user_id, display_name, university, mastered_count, avg_score
    FROM numbered_demos
    WHERE (SELECT count(*) FROM real_rows) < 10
  )
  SELECT user_id, display_name, university, mastered_count, avg_score
  FROM combined
  ORDER BY mastered_count DESC, avg_score DESC
  LIMIT 10;
$function$;

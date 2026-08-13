CREATE OR REPLACE FUNCTION public.admin_email_delivery_status()
RETURNS TABLE(
  email text,
  template_name text,
  status text,
  error_message text,
  sent_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (l.recipient_email, l.message_id)
      lower(l.recipient_email) AS email,
      l.template_name,
      l.status,
      l.error_message,
      l.created_at
    FROM public.email_send_log l
    ORDER BY l.recipient_email, l.message_id, l.created_at DESC
  ), newest AS (
    SELECT DISTINCT ON (email) email, template_name, status, error_message, created_at
    FROM latest
    ORDER BY email, created_at DESC
  )
  SELECT n.email, n.template_name, n.status, n.error_message, n.created_at
  FROM newest n
  WHERE public.is_super_admin()
     OR EXISTS (
       SELECT 1
       FROM public.licensees li
       JOIN public.licensee_companies lc ON lc.licensee_id = li.id
       WHERE lower(li.name) = n.email
         AND public.is_company_admin(lc.company_id)
     )
     OR EXISTS (
       SELECT 1 FROM public.invites i
       WHERE lower(i.email) = n.email
         AND public.is_company_admin(i.company_id)
     );
$$;

REVOKE ALL ON FUNCTION public.admin_email_delivery_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_delivery_status() TO authenticated;
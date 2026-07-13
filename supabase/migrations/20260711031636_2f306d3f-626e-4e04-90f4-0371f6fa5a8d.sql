-- Capture the production-only email queue functions and their pgmq triggers.
--
-- History: these two functions were created directly in production via the
-- Lovable Management API alongside the pg_cron job set up in
-- 20260702204509_email_infra.sql (see the POST-MIGRATION STEPS comment at the
-- bottom of that file). Their CREATE FUNCTION statements were never captured
-- in migrations, so `supabase db reset` broke on
-- 20260709162106_...sql's REVOKE/GRANT for them. This migration commits the
-- exact bodies pulled from production via
-- `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN (...)`, plus
-- the two pgmq AFTER INSERT triggers that call email_queue_wake().
--
-- Nothing in src/ or tests/ calls these RPCs directly; they only run from
-- pg_cron and from the pgmq enqueue triggers below. Applying this in
-- production is a no-op because the objects already exist with these
-- definitions (CREATE OR REPLACE + DROP TRIGGER IF EXISTS + CREATE TRIGGER).

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://qtstzkyycjldlwgiqsgh.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://qtstzkyycjldlwgiqsgh.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;

-- Wire email_queue_wake() into the pgmq enqueue path. These triggers exist in
-- production (verified via pg_trigger); recreate idempotently.
DROP TRIGGER IF EXISTS email_queue_wake_auth ON pgmq.q_auth_emails;
CREATE TRIGGER email_queue_wake_auth
  AFTER INSERT ON pgmq.q_auth_emails
  FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake();

DROP TRIGGER IF EXISTS email_queue_wake_transactional ON pgmq.q_transactional_emails;
CREATE TRIGGER email_queue_wake_transactional
  AFTER INSERT ON pgmq.q_transactional_emails
  FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake();

-- Lock down EXECUTE, matching the intent of 20260709162106's commented-out
-- block. Moved here (rather than uncommenting in place) so the functions are
-- guaranteed to exist before any GRANT targeting them runs.
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- Trigger-only function: no client access needed.
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

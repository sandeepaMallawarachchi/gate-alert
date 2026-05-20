
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior version of the job
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-shared-locations');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-shared-locations',
  '0 * * * *',
  $$ DELETE FROM public.shared_locations WHERE updated_at < now() - interval '24 hours'; $$
);

-- Keep scheduler history bounded: 14 days of successes, 30 days of failures.
-- Active runs are never removed. Business records are not touched.
select cron.schedule(
  'marine-tech-cron-history-retention',
  '27 10 * * *',
  $cron$
    delete from cron.job_run_details
    where (status = 'succeeded' and end_time < now() - interval '14 days')
       or (status = 'failed' and end_time < now() - interval '30 days');
  $cron$
);

-- Keep the parts cron as a rollback option, but don't disable it until the
-- replacement Cloudflare schedule is deployed and its invocation is verified.

-- Apply only after the external worker has passed a live authenticated check.
-- Worker: marine-tech-backend-maintenance; schedule remains every two minutes.
-- Keep this job's command/credentials intact for an immediate rollback.
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'parts-order-email';

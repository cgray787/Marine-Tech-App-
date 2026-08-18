import { supabase } from "@/lib/supabase";
import { savePendingJobPhoto, getPendingJobPhotos } from "@/lib/offline-db";

/**
 * Photos attached directly to a job.
 *
 * Distinct from the two existing kinds: service-report photos hang off a
 * submitted report, and campaign photos are warranty evidence for a specific
 * bulletin. These are for the ordinary case — a tech opens a job from the
 * calendar, sees the work in front of them, and shoots it. There may be no
 * report yet, and often never will be.
 *
 * They land in report_photos with job_id set and both report_id and
 * campaign_log_id null; migration 051 scopes them to the job's office.
 */

export interface JobPhoto {
  id: string;
  job_id: string;
  photo_url: string;
  caption: string | null;
  category: string | null;
  created_at: string | null;
}

export async function getJobPhotos(jobId: string): Promise<JobPhoto[]> {
  const { data, error } = await supabase
    .from("report_photos")
    .select("id, job_id, photo_url, caption, category, created_at")
    .eq("job_id", jobId)
    .is("report_id", null)
    .is("campaign_log_id", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as JobPhoto[];
}

/**
 * Upload a job photo, or queue it when there is no signal.
 *
 * Marinas routinely have none — losing a photo the tech just took at the boat is
 * the outcome most worth designing against, so a failure here queues rather than
 * throwing.
 */
export async function uploadJobPhoto(
  jobId: string,
  localUri: string,
  caption?: string | null,
  isOnline = true
): Promise<{ photo: JobPhoto | null; queued: boolean }> {
  if (!isOnline) {
    await savePendingJobPhoto(jobId, localUri, caption ?? null);
    return { photo: null, queued: true };
  }

  const fileName = `jobs/${jobId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`;

  try {
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("report-photos")
      .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("report-photos").getPublicUrl(fileName);

    const { data, error } = await supabase
      .from("report_photos")
      .insert({
        job_id: jobId,
        photo_url: publicUrl,
        category: "work_area",
        caption: caption ?? null,
      })
      .select("id, job_id, photo_url, caption, category, created_at")
      .single();
    if (error) throw error;
    return { photo: data as unknown as JobPhoto, queued: false };
  } catch {
    await savePendingJobPhoto(jobId, localUri, caption ?? null);
    return { photo: null, queued: true };
  }
}

/**
 * Remove a photo shot in error. Job photos are working documentation rather than
 * warranty evidence, so unlike campaign photos an accidental shot should not be
 * permanent.
 */
export async function deleteJobPhoto(id: string): Promise<void> {
  const { error } = await supabase.from("report_photos").delete().eq("id", id);
  if (error) throw error;
}

/** Photos still waiting in the offline queue for this job. */
export async function pendingJobPhotoUris(jobId: string): Promise<string[]> {
  return getPendingJobPhotos(jobId);
}

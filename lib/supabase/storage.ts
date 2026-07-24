import { SupabaseClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'documents';

/**
 * Upload a file to the documents bucket in Supabase Storage.
 * Returns the storage path on success.
 */
export async function uploadFile(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ storagePath: string }> {
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${timestamp}_${sanitizedName}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return { storagePath };
}

/**
 * Download a file from the documents bucket.
 * Returns the file as an ArrayBuffer.
 */
export async function downloadFile(
  supabase: SupabaseClient,
  storagePath: string
): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? 'No data returned'}`);
  }

  return await data.arrayBuffer();
}

/**
 * Delete a file from the documents bucket.
 */
export async function deleteFile(
  supabase: SupabaseClient,
  storagePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

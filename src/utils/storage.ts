import { randomUUID } from 'crypto';
import path from 'path';
import { supabase } from '../supabase/client';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'post-covers';

/**
 * Thrown when Supabase Storage itself fails (network/config/bucket errors),
 * so the global error handler can map it to a clear response instead of a
 * generic 500.
 */
export class StorageError extends Error {
  status = 502;
}

/**
 * Builds a company-scoped storage path so covers from different companies
 * can never collide or overwrite each other. `companyId` must come from the
 * authenticated JWT, never from client input.
 */
export const buildCoverStoragePath = (companyId: number, originalFilename: string): string => {
  const ext = path.extname(originalFilename).toLowerCase();
  const base = path
    .basename(originalFilename, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);

  return `${companyId}/${randomUUID()}${base ? `-${base}` : ''}${ext}`;
};

/**
 * Uploads a cover image buffer to Supabase Storage and returns its public URL.
 */
export const uploadCoverToStorage = async (companyId: number, file: Express.Multer.File): Promise<string> => {
  const objectPath = buildCoverStoragePath(companyId, file.originalname);

  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    throw new StorageError('Could not upload cover image.');
  }

  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
};

/**
 * Best-effort cleanup of a previous cover image. Only deletes URLs that were
 * actually produced by this app's uploader (i.e. live in our own bucket) —
 * a `cover` set via the plain-URL JSON flow points elsewhere and is left
 * untouched. Never throws: a failed cleanup must not fail the request that
 * triggered it.
 */
export const deleteCoverFromStorage = async (url: string): Promise<void> => {
  const prefix = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(prefix);
  if (index === -1) return;

  const objectPath = url.slice(index + prefix.length);
  if (!objectPath) return;

  try {
    await supabase.storage.from(BUCKET).remove([objectPath]);
  } catch (error) {
    console.warn('[Storage] Failed to delete previous cover image:', error);
  }
};

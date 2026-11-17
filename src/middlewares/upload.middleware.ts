import multer from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Max cover size in MB, configurable via MAX_COVER_SIZE_MB (default 20). */
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_COVER_SIZE_MB) || 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
/**
 * Max size in MB of a request body (JSON) or of a single multipart text field
 * such as the post `body`, configurable via MAX_BODY_SIZE_MB (default 5).
 */
export const MAX_BODY_SIZE_MB = Number(process.env.MAX_BODY_SIZE_MB) || 5;

/** Thrown by the fileFilter below when the uploaded mimetype isn't allowed. */
export class InvalidFileTypeError extends Error {
  status = 400;
}

/**
 * Builds a middleware that parses one optional image file from the given
 * multipart/form-data field, kept in memory (never written to disk) so it can
 * be forwarded straight to Supabase Storage. Only wired on routes that accept
 * a body (POST/PUT) — a plain JSON request is unaffected, since multer only
 * parses multipart/form-data.
 */
export const uploadImage = (field: string) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES, fieldSize: MAX_BODY_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(new InvalidFileTypeError(`Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`));
        return;
      }
      cb(null, true);
    },
  }).single(field);

/** Optional `cover` file for posts. */
export const uploadCoverImage = uploadImage('cover');

/** Optional `image` file for events. */
export const uploadEventImage = uploadImage('image');

import multer from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** Thrown by the fileFilter below when the uploaded mimetype isn't allowed. */
export class InvalidFileTypeError extends Error {
  status = 400;
}

/**
 * Parses an optional `cover` file from multipart/form-data requests, kept in
 * memory (never written to disk) so it can be forwarded straight to Supabase
 * Storage. Only wired on routes that accept a body (POST/PUT) — a plain JSON
 * request is unaffected, since multer only parses multipart/form-data.
 */
export const uploadCoverImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new InvalidFileTypeError(`Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`));
      return;
    }
    cb(null, true);
  },
}).single('cover');

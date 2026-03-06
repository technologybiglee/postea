import slugify from 'slugify';

/**
 * Generates a URL-friendly slug from a title.
 * Appends a short timestamp suffix to guarantee uniqueness
 * without an extra DB roundtrip.
 *
 * Example: "Mi Primer Post" → "mi-primer-post-1709123456789"
 */
export const generateSlug = (title: string): string => {
  const base = slugify(title, { lower: true, strict: true, locale: 'es' });
  return `${base}-${Date.now()}`;
};

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Reads `page` / `limit` from a query object. Invalid or missing values fall
 * back to defaults; `limit` is clamped to [1, maxLimit].
 */
export const parsePagination = (
  query: Record<string, unknown>,
  { defaultLimit = 10, maxLimit = 50 }: { defaultLimit?: number; maxLimit?: number } = {},
): Pagination => {
  const page  = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const buildMeta = (total: number, page: number, limit: number): PaginationMeta => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

/**
 * Normalizes a query value that may be a comma-separated string ("a,b") or a
 * repeated param (?x=a&x=b, parsed as an array) into a list of trimmed,
 * non-empty strings. Returns undefined when the param is absent or empty.
 */
export const parseList = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const items = raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return items.length > 0 ? items : undefined;
};

/**
 * Like parseList, but every item must be a positive integer. Throws an Error
 * with a clear message otherwise, which controllers turn into a 400.
 */
export const parseIdList = (value: unknown, name: string): number[] | undefined => {
  const items = parseList(value);
  if (!items) return undefined;

  return items.map((item) => {
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`${name} must be a positive integer or a comma-separated list of them.`);
    }
    return n;
  });
};

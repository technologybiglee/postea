-- "circular" is now a marquee bar (top/bottom), no longer a corner circle.
UPDATE "events" SET "position" = 'top' WHERE "type" = 'circular' AND ("position" IS NULL OR "position" NOT IN ('top', 'bottom'));

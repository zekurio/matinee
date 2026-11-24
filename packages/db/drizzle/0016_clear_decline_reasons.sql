-- A decline carries only the reason an admin typed. The picked reasons
-- go; "notFound" stays as the mark of a request given up on, which still
-- counts as arrived if its file turns up.
UPDATE "request" SET "decline_reason" = NULL WHERE "decline_reason" IS DISTINCT FROM 'notFound';

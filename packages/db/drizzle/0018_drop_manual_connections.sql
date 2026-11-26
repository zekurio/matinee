-- The "By hand" source is gone. Its connections go with it: their rules
-- cascade, and the requests sent through them keep no connection, as
-- when an admin deletes one.
DELETE FROM "fulfilment_connection" WHERE "source" = 'manual';

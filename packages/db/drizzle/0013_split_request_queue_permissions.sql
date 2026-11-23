-- One permission guarded everyone's requests; now approving, declining,
-- and retrying are separate. A token that could change the queue keeps
-- all three, so it does exactly what it did before.
UPDATE "api_token" SET "permissions" = array_remove("permissions", 'adminRequest.update') || ARRAY['adminRequest.approve', 'adminRequest.decline', 'adminRequest.retry'] WHERE 'adminRequest.update' = ANY("permissions");

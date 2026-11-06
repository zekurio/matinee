-- The probe now reads color primaries, matrix, range, interlacing, the full
-- Dolby Vision record, HDR10+, and HDR10 metadata. Probes in the old shape
-- don't validate, so drop them and probe every file again.
UPDATE "media_item" SET "probe" = NULL, "probed_at" = NULL, "probe_error" = NULL;

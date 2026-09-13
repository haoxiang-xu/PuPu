/* Application-owned verification evidence only. Plugin manifests, metadata
 * responses, names and legacy trustLevel flags cannot populate this list.
 *
 * A record binds { toolkitId, source, version, sourceRepo } to a status,
 * approved scope codes, reviewedAt (YYYY-MM-DD), reviewedBy and an HTTPS
 * evidence reference. See docs/implementation/ticket-278.md.
 *
 * Existing catalog "verified" flags do not identify a checked scope or
 * artifact. Keep this empty until an actual scoped record is available;
 * do not fabricate endorsements to make the verified badge appear. */
export const PLUGIN_VERIFICATION_RECORDS = Object.freeze([]);

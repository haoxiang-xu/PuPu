import { useEffect } from "react";

import { maybeMigrateProviderSecrets } from "../../../SERVICEs/provider_secret_migration";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ProviderSecretMigrationBootSync — headless Phase 4 activation trigger          */
/*                                                                                */
/*  Renders nothing. On the first renderer mount it fires the once-per-session     */
/*  provider secret migration: the renderer's legacy localStorage provider keys    */
/*  are handed to the main process to be encrypted into the provider_credentials   */
/*  table. Without this the table would stay empty and the Phase 4 encrypted-       */
/*  secret path would never activate.                                              */
/*                                                                                 */
/*  Fire-and-forget: maybeMigrateProviderSecrets never throws (every guard is a    */
/*  silent no-op and a failed migrate is caught + logged by code, retried next     */
/*  launch), but guard the promise anyway so nothing can surface as an unhandled    */
/*  boot rejection. Idempotent within a session (the module holds its own guard).  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ProviderSecretMigrationBootSync = () => {
  useEffect(() => {
    maybeMigrateProviderSecrets().catch(() => {});
  }, []);

  return null;
};

export default ProviderSecretMigrationBootSync;

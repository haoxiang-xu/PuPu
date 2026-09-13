import { useEffect } from "react";

import { migrateShippedProviderCopies } from "../../../SERVICEs/custom_provider_store";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ShippedProviderMigrationBootSync — headless legacy-copy cleanup (#202)         */
/*                                                                                */
/*  Renders nothing. On the first renderer mount it removes any DeepSeek/Kimi      */
/*  definition that the pre-#202 "import the preset on first key save" path wrote  */
/*  into custom_providers[]. The app bundle is the only source of a shipped        */
/*  provider's definition now, so the copy is dead weight that would otherwise     */
/*  sit in storage forever.                                                        */
/*                                                                                */
/*  The stored API key is not touched. Nothing here is load-bearing: the store's   */
/*  read path already ignores such a copy, so a failed or skipped run costs        */
/*  nothing but a stale row. Idempotent — a second launch writes nothing.          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ShippedProviderMigrationBootSync = () => {
  useEffect(() => {
    try {
      const result = migrateShippedProviderCopies();
      if (result?.persistence) {
        result.persistence.catch(() => {});
      }
    } catch (_error) {
      // A cleanup that cannot run is not a boot failure.
    }
  }, []);

  return null;
};

export default ShippedProviderMigrationBootSync;

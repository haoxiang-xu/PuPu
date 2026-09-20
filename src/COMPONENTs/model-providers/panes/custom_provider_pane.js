import { useContext, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { CustomProviderRow } from "../../settings/model_providers/custom-providers/custom_provider_list";
import CustomProviderEditor from "../../settings/model_providers/custom-providers/custom_provider_editor";
import { exportCustomProvider } from "../../settings/model_providers/custom-providers/export_provider";
import { findCustomProvider } from "../../../SERVICEs/custom_provider_store";
import { toast } from "../../../SERVICEs/toast";

/**
 * CustomProviderPane — one user-authored provider (#204). Reuses the Settings
 * list row (enable toggle, edit, export, delete) and the editor modal
 * verbatim; the pane only adds the A1 heading. Every write still goes through
 * the custom-provider store helpers, which emit the catalog refresh the rail
 * listens to.
 */
export const CustomProviderPane = ({ entry, onDeleted }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const [editorOpen, setEditorOpen] = useState(false);

  /* Re-read on each render: the entry's `provider` snapshot is rebuilt on
     catalog refresh, but a row action (toggle) resolves before the refresh
     re-renders us, so the store is the safer source for the row. */
  const provider = findCustomProvider(entry.provider.id) || entry.provider;

  const handleExport = async (slug) => {
    const result = await exportCustomProvider(slug);
    if (result.ok) {
      toast.success(t("model_providers.custom.export_success"), {
        dedupeKey: `custom_provider_export_${slug}`,
      });
    } else if (result.error !== "canceled") {
      toast.error(t("model_providers.custom.export_failed"), {
        dedupeKey: `custom_provider_export_fail_${slug}`,
      });
    }
  };

  const handleChanged = () => {
    /* The store emitted a refresh; if the provider is gone the row deleted
       it — hand the selection back to the parent. */
    if (!findCustomProvider(entry.provider.id)) {
      onDeleted?.();
    }
  };

  return (
    <div data-testid={`custom-provider-pane-${provider.id}`}>
      <CustomProviderRow
        provider={provider}
        isDark={isDark}
        onEdit={() => setEditorOpen(true)}
        onExport={handleExport}
        onChanged={handleChanged}
      />
      <CustomProviderEditor
        open={editorOpen}
        slug={provider.id}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {}}
      />
    </div>
  );
};

export default CustomProviderPane;

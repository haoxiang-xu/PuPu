import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SettingsSection } from "../../appearance";
import { readCustomProviders } from "../../../../SERVICEs/custom_provider_store";
import { subscribeModelCatalogRefresh } from "../../../../SERVICEs/model_catalog_refresh";
import { toast } from "../../../../SERVICEs/toast";
import CustomProviderList from "./custom_provider_list";
import CustomProviderEditor from "./custom_provider_editor";
import CustomProviderImportModal from "./custom_provider_import_modal";
import PresetPicker from "./preset_picker";
import { exportCustomProvider } from "./export_provider";

/**
 * CustomProvidersSection — settings surface for user-defined model providers
 * (design §6.1). CRUD via the list + editor (S4a); import / export / preset via
 * the import modal + preset picker (S5). All state flows through the store
 * helpers; a catalog-refresh subscription keeps the list live.
 */
const CustomProvidersSection = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const [providers, setProviders] = useState(() => readCustomProviders());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetSeed, setPresetSeed] = useState(null);

  const refresh = () => setProviders(readCustomProviders());

  // Keep in sync with any store write (add/update/remove/enable/secret all
  // emit a catalog refresh through the store helpers).
  useEffect(() => subscribeModelCatalogRefresh(refresh), []);

  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const mutedColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.45)";
  const actionBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.055)";

  const openAdd = () => {
    setEditingSlug(null);
    setEditorOpen(true);
  };
  const openEdit = (slug) => {
    setEditingSlug(slug);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingSlug(null);
  };

  const openImport = () => {
    setPresetSeed(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    setImportOpen(false);
    setPresetSeed(null);
  };

  const openPresetPicker = () => setPresetOpen(true);
  const handlePresetSelect = (envelope) => {
    setPresetOpen(false);
    // Feed the preset envelope through the same import pipeline.
    setPresetSeed(envelope);
    setImportOpen(true);
  };

  // After an import/preset write completes, if the provider needs a key, open
  // the editor so the user can enter it (reuses the editor's auto-enable flow).
  const handleImported = ({ slug, requiresKey }) => {
    refresh();
    if (requiresKey) {
      setEditingSlug(slug);
      setEditorOpen(true);
    }
  };

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

  const secondaryButtonStyle = {
    fontSize: 11.5,
    fontFamily,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    color: mutedColor,
    content: { icon: { width: 13, height: 13 } },
  };

  return (
    <SettingsSection
      title={t("model_providers.custom.section_title")}
      icon="server"
    >
      <p
        style={{
          margin: "8px 0 4px",
          fontSize: 12.5,
          fontFamily,
          color: mutedColor,
          lineHeight: 1.5,
        }}
      >
        {t("model_providers.custom.section_desc")}
      </p>

      <CustomProviderList
        providers={providers}
        isDark={isDark}
        onEdit={openEdit}
        onExport={handleExport}
        onChanged={refresh}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          paddingBottom: 4,
        }}
      >
        <Button
          label={t("model_providers.custom.add")}
          prefix_icon="add"
          onClick={openAdd}
          style={{
            fontSize: 12,
            fontFamily,
            fontWeight: 500,
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: 8,
            color: accentColor,
            content: { icon: { width: 14, height: 14 } },
            root: { background: actionBg },
          }}
        />
        <Button
          label={t("model_providers.custom.add_from_preset")}
          prefix_icon="add"
          onClick={openPresetPicker}
          style={secondaryButtonStyle}
        />
        <Button
          label={t("model_providers.custom.import")}
          prefix_icon="download"
          onClick={openImport}
          style={secondaryButtonStyle}
        />
      </div>

      <CustomProviderEditor
        open={editorOpen}
        slug={editingSlug}
        onClose={closeEditor}
        onSaved={refresh}
      />

      <CustomProviderImportModal
        open={importOpen}
        presetSeed={presetSeed}
        onClose={closeImport}
        onImported={handleImported}
      />

      <PresetPicker
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        onSelect={handlePresetSelect}
      />
    </SettingsSection>
  );
};

export default CustomProvidersSection;
export { CustomProvidersSection };

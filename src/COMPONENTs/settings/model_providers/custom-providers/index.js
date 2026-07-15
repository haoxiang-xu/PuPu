import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SettingsSection } from "../../appearance";
import { readCustomProviders } from "../../../../SERVICEs/custom_provider_store";
import { subscribeModelCatalogRefresh } from "../../../../SERVICEs/model_catalog_refresh";
import CustomProviderList from "./custom_provider_list";
import CustomProviderEditor from "./custom_provider_editor";

/**
 * CustomProvidersSection — settings surface for user-defined model providers
 * (design §6.1, slice S4a). Shell reuses SettingsSection; the list + editor do
 * the CRUD. Import / preset entry points are S5: rendered as disabled
 * placeholders here so the layout is stable when S5 lands.
 */
const CustomProvidersSection = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const [providers, setProviders] = useState(() => readCustomProviders());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState(null);

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

  const secondaryButtonStyle = {
    fontSize: 11.5,
    fontFamily,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    color: mutedColor,
    content: { icon: { width: 13, height: 13 } },
    state: { disabled: { root: { opacity: 0.4, cursor: "not-allowed" } } },
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
        {/* S5 entry points — placeholders, wired in the import/preset slice. */}
        <Button
          label={t("model_providers.custom.add_from_preset")}
          prefix_icon="add"
          disabled
          title={t("model_providers.custom.coming_soon")}
          onClick={() => {}}
          style={secondaryButtonStyle}
        />
        <Button
          label={t("model_providers.custom.import")}
          prefix_icon="download"
          disabled
          title={t("model_providers.custom.coming_soon")}
          onClick={() => {}}
          style={secondaryButtonStyle}
        />
      </div>

      <CustomProviderEditor
        open={editorOpen}
        slug={editingSlug}
        onClose={closeEditor}
        onSaved={refresh}
      />
    </SettingsSection>
  );
};

export default CustomProvidersSection;
export { CustomProvidersSection };

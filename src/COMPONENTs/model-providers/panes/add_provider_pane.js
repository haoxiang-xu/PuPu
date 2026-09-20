import { useContext, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import CustomProviderEditor from "../../settings/model_providers/custom-providers/custom_provider_editor";
import CustomProviderImportModal from "../../settings/model_providers/custom-providers/custom_provider_import_modal";
import PresetPicker from "../../settings/model_providers/custom-providers/preset_picker";
import { customRailId } from "../rail_entries";

/**
 * AddProviderPane — the "Add provider" rail entry (#204). The same three ways
 * in as the Settings section had (Add / From preset / Import), driving the
 * same modals. When a provider comes into existence the parent is told its
 * rail id so the selection lands on it; an import that still needs a key
 * opens the editor focused on the key field first (C12), exactly as before.
 */
export const AddProviderPane = ({ onCreated }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState(null);
  const [editorAutoFocusKey, setEditorAutoFocusKey] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetSeed, setPresetSeed] = useState(null);

  const openAdd = () => {
    setEditingSlug(null);
    setEditorAutoFocusKey(false);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingSlug(null);
    setEditorAutoFocusKey(false);
  };
  const openImport = () => {
    setPresetSeed(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    setImportOpen(false);
    setPresetSeed(null);
  };
  const handlePresetSelect = (envelope) => {
    setPresetOpen(false);
    setPresetSeed(envelope);
    setImportOpen(true);
  };
  const handleImported = ({ slug, requiresKey }) => {
    if (requiresKey) {
      setEditingSlug(slug);
      setEditorAutoFocusKey(true);
      setEditorOpen(true);
      return;
    }
    onCreated?.(customRailId(slug));
  };
  const handleSaved = (slug) => {
    if (typeof slug === "string" && slug) {
      onCreated?.(customRailId(slug));
    }
  };

  const buttonStyle = {
    fontSize: 12.5,
    fontFamily,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 7,
    color: "var(--pupu-text-secondary)",
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    content: { icon: { width: 13, height: 13 } },
  };

  return (
    <div data-testid="add-provider-pane">
      <p
        style={{
          margin: "4px 0 14px",
          fontSize: 12.5,
          fontFamily,
          color: "var(--pupu-text-faint)",
          lineHeight: 1.5,
        }}
      >
        {t("model_providers.custom.section_desc")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button
          label={t("model_providers.custom.add")}
          prefix_icon="add"
          onClick={openAdd}
          style={{ ...buttonStyle, backgroundColor: "var(--pupu-overlay-active)" }}
        />
        <Button
          label={t("model_providers.custom.add_from_preset")}
          prefix_icon="add"
          onClick={() => setPresetOpen(true)}
          style={buttonStyle}
        />
        <Button
          label={t("model_providers.custom.import")}
          prefix_icon="download"
          onClick={openImport}
          style={buttonStyle}
        />
      </div>

      <CustomProviderEditor
        open={editorOpen}
        slug={editingSlug}
        autoFocusKey={editorAutoFocusKey}
        onClose={closeEditor}
        onSaved={handleSaved}
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
    </div>
  );
};

export default AddProviderPane;

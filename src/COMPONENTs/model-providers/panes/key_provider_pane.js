import ProviderKeySection from "../../settings/model_providers/components/provider_key_section";
import { RAIL_KIND } from "../rail_entries";

/**
 * KeyProviderPane — a native or shipped provider's pane (#204): the ONE key
 * control (`ProviderKeySection`), nothing else — a key provider's page is its
 * key configuration (project owner). The heading is the modal's fixed header
 * (model_providers_modal_content.js), so the control renders bare.
 */
export const KeyProviderPane = ({ entry }) => {
  const provider = entry.provider;
  if (entry.kind === RAIL_KIND.SHIPPED) {
    return (
      <ProviderKeySection
        key={entry.id}
        heading="none"
        title={provider.title}
        icon={provider.icon}
        sites={provider.sites}
        placeholder={provider.placeholder}
        key_url={provider.key_url}
      />
    );
  }
  return (
    <ProviderKeySection
      key={entry.id}
      heading="none"
      title={provider.title}
      icon={provider.icon}
      storage_key={provider.storage_key}
      credential_id={provider.credential_id}
      placeholder={provider.placeholder}
      key_url={provider.key_url}
    />
  );
};

export default KeyProviderPane;

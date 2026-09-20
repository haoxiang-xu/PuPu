import ProviderKeySection from "../../settings/model_providers/components/provider_key_section";
import { RAIL_KIND } from "../rail_entries";

/**
 * KeyProviderPane — a native or shipped provider's pane (#204): the ONE key
 * control (`ProviderKeySection`) in its page-heading form, nothing else. A
 * key provider's page is its key configuration — project owner decision.
 */
export const KeyProviderPane = ({ entry }) => {
  const provider = entry.provider;
  if (entry.kind === RAIL_KIND.SHIPPED) {
    return (
      <ProviderKeySection
        key={entry.id}
        heading="page"
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
      heading="page"
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

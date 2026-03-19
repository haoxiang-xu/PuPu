import interactRegistry from "./interact_registry";

/**
 * InteractWrapper – looks up the interact registry by type and renders the
 * matching component.  Falls back to null for unknown types so TraceChain
 * can silently skip unsupported interactions.
 *
 * Standardised props passed to every interact component:
 *   config           – the interact_config object from the payload
 *   onSubmit(data)   – call with the user's response; data format is
 *                       component-specific but always goes into
 *                       modified_arguments.user_response
 *   uiState          – { status, error, resolved, decision } from the parent
 *   isDark           – dark-mode flag
 *   disabled         – true when the interaction has already been submitted
 */
const InteractWrapper = ({
  type,
  config,
  onSubmit,
  uiState,
  isDark,
  disabled,
}) => {
  const Component = interactRegistry[type];
  if (!Component) return null;

  return (
    <Component
      config={config || {}}
      onSubmit={onSubmit}
      uiState={uiState || {}}
      isDark={isDark}
      disabled={disabled}
    />
  );
};

export default InteractWrapper;

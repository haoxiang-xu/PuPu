/* SectionCaption — the store's section header: an uppercase caption, an
   optional action on the same line, and ONE hairline under it (SPEC rules 1
   and 2: no fill, one rule per section). Rows sit straight on the background
   below it. */
const SectionCaption = ({ label, action, testId }) => (
  <div
    data-testid={testId}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "11px 0 6px",
      borderBottom: "1px solid var(--pupu-border-subtle)",
    }}
  >
    <span
      style={{
        flex: 1,
        minWidth: 0,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "rgba(var(--pupu-text-rgb),0.42)",
      }}
    >
      {label}
    </span>
    {action}
  </div>
);

export default SectionCaption;

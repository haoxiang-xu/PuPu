/* TypeTag — the type caption that follows a plugin's name: TOOLKIT, MCP,
   SKILL. Set as an uppercase caption at the same voice as a SettingsSection
   title, with no fill, no border and no hue, because PuPu's block style
   carries meaning in words and position rather than colour.

   Type is NOT exclusive. plugins_categories_page derives it from three
   independent predicates (a command list makes something a skill, an MCP
   source makes it mcp, otherwise it is a toolkit), so a builtin toolkit
   that also ships a /command is both and carries both tags. */

const KNOWN_TYPES = { toolkit: "TOOLKIT", mcp: "MCP", skill: "SKILL" };

const TypeTag = ({ types, dim = false }) => {
  const labels = (Array.isArray(types) ? types : [])
    .map((type) => KNOWN_TYPES[String(type).toLowerCase()])
    .filter(Boolean);

  if (labels.length === 0) return null;

  const alpha = dim ? 0.26 : 0.36;

  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 500,
        letterSpacing: "0.13em",
        textTransform: "uppercase",
        color: `rgba(var(--pupu-text-rgb),${alpha})`,
        whiteSpace: "nowrap",
        flex: "0 0 auto",
      }}
    >
      {labels.join(" · ")}
    </span>
  );
};

export default TypeTag;

/* store_categories — the rail's arithmetic, with no React and no I/O.
   The sidebar's Browse section is the store, so these four functions decide
   what rows it shows, in what order, and what each one holds.

   Admission for `storeCategory` is OPEN: absent, unknown and wrong-typed
   values are all treated the same way — the item has no category, is
   reachable under All, and creates no rail row. A rail row that leads
   nowhere is worse than one category fewer. */

export const CATEGORY_IDS = [
  "browser",
  "communication",
  "dev",
  "devops",
  "memory",
  "productivity",
  "workspace",
];

/* PuPu's own toolkits are grouped by who made them, not by subject. The row
   is pinned under All and never competes on count: it is provenance. */
export const PUPU_OFFICIAL_ID = "pupu_official";

const KNOWN = new Set([...CATEGORY_IDS, PUPU_OFFICIAL_ID]);

/* An MCP registry entry names its subject `category`; skill packs and catalog
   toolkits name it `storeCategory`. Both are read, storeCategory first, and
   either one must still be a known id to count. */
const categoryOf = (item) => {
  if (!item || typeof item !== "object") return "";
  const value = item.storeCategory ?? item.category;
  return typeof value === "string" && KNOWN.has(value) ? value : "";
};

export const categoryCounts = ({ entries = [], packs = [], builtins = [] } = {}) => {
  const counts = {};
  const bump = (id) => {
    if (!id) return;
    counts[id] = (counts[id] || 0) + 1;
  };

  [...entries, ...packs].forEach((item) => bump(categoryOf(item)));
  /* Builtins land in PuPu Official whatever they carry: they are PuPu's own
     regardless of what subject they touch. */
  builtins.forEach(() => bump(PUPU_OFFICIAL_ID));

  return counts;
};

export const orderedCategories = (counts = {}) => {
  const rows = Object.keys(counts)
    .filter((id) => KNOWN.has(id) && counts[id] > 0)
    .map((id) => ({ id, count: counts[id] }));

  const pinned = rows.filter((row) => row.id === PUPU_OFFICIAL_ID);
  const rest = rows
    .filter((row) => row.id !== PUPU_OFFICIAL_ID)
    /* Count descending, then id ascending — without the tiebreak, two
       equal counts could swap places between renders and the rail would
       appear to shuffle on its own. */
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return [...pinned, ...rest];
};

export const matchesCategory = (item, categoryId) => {
  if (categoryId === "all") return true;
  return categoryOf(item) === categoryId;
};

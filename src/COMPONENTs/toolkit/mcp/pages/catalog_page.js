import { useEffect, useState, useMemo } from "react";
import { api } from "../../../../SERVICEs/api";
import CatalogCard from "../components/catalog_card";
import { FormInput } from "../components/shared";

const CatalogPage = ({ isDark, onInstall }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.mcp.listCatalog().then((data) => {
      if (!cancelled) {
        setEntries(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.publisher.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Search bar ── */}
      <FormInput
        isDark={isDark}
        placeholder="Search servers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* ── Loading ── */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
          }}
        >
          Loading catalog...
        </div>
      )}

      {/* ── Grid ── */}
      {!loading && filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          {filtered.map((entry) => (
            <CatalogCard
              key={entry.id}
              entry={entry}
              isDark={isDark}
              onClick={() => onInstall?.(entry)}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
          }}
        >
          {search.trim()
            ? "No servers match your search."
            : "No servers available."}
        </div>
      )}
    </div>
  );
};

export default CatalogPage;

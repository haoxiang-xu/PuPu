/* store_latest — Discover's Latest band, with no React and no I/O.

   BC-002 consumer. Admission is OPEN with strict values: an absent, malformed,
   wrong-typed or future date means "no date", which keeps that item out of
   Latest and nowhere else. Nothing here throws on bad input. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const parts = (iso) => {
  const match = ISO_DATE.exec(iso);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

export const todayIso = (now = new Date()) => {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export const admitAddedAt = (value, today) => {
  if (typeof value !== "string") return "";
  const p = parts(value);
  if (!p) return "";
  const [year, month, day] = p;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  if (typeof today === "string" && value > today) return "";
  return value;
};

/* Only what a user can actually get belongs in Latest. */
const isListable = (entry) =>
  Boolean(entry) &&
  entry.status !== "needs_review" &&
  entry.status !== "deprecated" &&
  entry.status !== "coming_soon" &&
  entry.deprecated !== true;

export const latestItems = ({ entries = [], packs = [], today, limit = 3 } = {}) => {
  const rows = [];
  entries.forEach((item) => {
    if (!isListable(item)) return;
    const addedAt = admitAddedAt(item.addedAt, today);
    if (!addedAt) return;
    rows.push({ kind: "entry", item, addedAt, name: String(item.toolkitName || item.name || item.id || "") });
  });
  packs.forEach((item) => {
    const addedAt = admitAddedAt(item?.review?.reviewedAt, today);
    if (!addedAt) return;
    rows.push({ kind: "pack", item, addedAt, name: String(item.title || item.id || "") });
  });
  /* Newest first; a same-day tie falls back to the name, so two things added
     on one day never swap places between renders. */
  rows.sort((a, b) =>
    a.addedAt === b.addedAt ? a.name.localeCompare(b.name) : a.addedAt < b.addedAt ? 1 : -1,
  );
  return rows.slice(0, Math.max(0, limit));
};

const formatter = (locale) => {
  try {
    return new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
};

/* "11 days ago" reads as news; an ISO date reads as metadata. Intl does the
   wording in every locale, so this adds no translation keys. */
export const relativeDayLabel = (iso, today, locale) => {
  const date = admitAddedAt(iso, today);
  const now = admitAddedAt(today);
  if (!date || !now) return "";
  const [y1, m1, d1] = parts(date);
  const [y2, m2, d2] = parts(now);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  const format = formatter(locale);
  if (days < 14) return format.format(-days, "day");
  if (days < 60) return format.format(-Math.round(days / 7), "week");
  if (days < 365) return format.format(-Math.round(days / 30), "month");
  return format.format(-Math.round(days / 365), "year");
};

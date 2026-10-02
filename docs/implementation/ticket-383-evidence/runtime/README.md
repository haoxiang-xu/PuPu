# Exact-runtime recovery backup

This is the single built-once Unchain wheel used for ticket 383's isolated producer
and renderer evidence. Source: haoxiang-xu/unchain at
1ec49ddfc28d3b42ba035debada5e3db759dad1b.

Wheel SHA-256:
f62aa13af4525e5e98548612bc15171cbc01c784e7be55f73d704c7840164889
Imported runtime manifest digest:
a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be
Git blob SHA: be8d8d7ee9cb2cddd3d41f889728abdcf6817f6b
Size: 1,160,341 bytes; 350 package/dist-info entries.

Archive verification found only the unchain package and its distribution metadata,
no .env files, credentials, private environment configuration or dependency caches.
The owner authorized this bounded recovery backup on the dedicated ticket branch.
Because packaging binaries are normally gitignored, remove this recovery file from
the final production diff while retaining and referencing this backup commit. Do
not rebuild the wheel for this evidence pair. After a reset, fetch this commit and
materialize the wheel into an isolated test directory, then verify its SHA-256.

CREATE TABLE invitations (
  hash TEXT PRIMARY KEY CHECK(length(hash) = 64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE responses (
  invitation_hash TEXT PRIMARY KEY REFERENCES invitations(hash),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  submitted_at TEXT NOT NULL
);

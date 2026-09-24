-- Additive credentials; existing invitation/SMS identities, roles and records retain their IDs.
CREATE TABLE auth_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

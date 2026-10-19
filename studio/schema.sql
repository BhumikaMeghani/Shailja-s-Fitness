PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id),
    csrf TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
    bucket TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempt_lookup ON attempts(bucket, created);
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    service TEXT NOT NULL, starts_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('demo','held','pending','confirmed','expired')),
    amount INTEGER, duration INTEGER, currency TEXT NOT NULL DEFAULT 'INR',
    expires INTEGER, order_id TEXT UNIQUE, payment_id TEXT UNIQUE,
    created INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS occupied_slot ON bookings(starts_at)
    WHERE status IN ('demo','held','pending','confirmed');
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL
);

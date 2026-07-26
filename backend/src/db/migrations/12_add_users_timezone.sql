-- The users table was created before the timezone column was added to schema.pg.sql.
-- CREATE TABLE IF NOT EXISTS is a no-op when the table already exists, so the
-- column was never added on existing databases.  getUserTimezone() does
-- SELECT timezone FROM users, which crashes with "column users.timezone does not exist".
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

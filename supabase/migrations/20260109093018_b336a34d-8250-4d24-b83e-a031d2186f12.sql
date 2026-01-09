-- Add email to profiles so we can map username -> email for auth login
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text;

-- Optional uniqueness: allow nulls, but ensure non-null emails are unique
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
ON public.profiles (email)
WHERE email IS NOT NULL;

-- Helpful lookup index for username -> email
CREATE INDEX IF NOT EXISTS profiles_username_idx
ON public.profiles (username);
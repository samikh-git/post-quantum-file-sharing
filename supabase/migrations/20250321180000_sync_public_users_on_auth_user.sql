-- When a row is inserted into auth.users (email/password, OAuth, or admin invite),
-- ensure a matching public.users profile exists so the API can resolve username and share URLs.
--
-- Apply with: npx supabase db push   (or paste into SQL Editor as a one-off)
--
-- Requires: public.users(id) stores the same UUID as auth.users.id, and public_key is NOT NULL
-- (empty string is used until the client sets a real ML-KEM key if your flow requires it).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_username text;
  email_local text;
  base text;
  uname text;
BEGIN
  meta_username := NEW.raw_user_meta_data ->> 'username';
  IF meta_username IS NOT NULL AND length(trim(meta_username)) > 0 THEN
    base := lower(regexp_replace(trim(meta_username), '[^a-z0-9_]', '_', 'g'));
  ELSE
    email_local := split_part(COALESCE(NEW.email, 'user'), '@', 1);
    base := lower(regexp_replace(email_local, '[^a-z0-9_]', '_', 'g'));
  END IF;

  IF base IS NULL OR base = '' THEN
    base := 'user';
  END IF;

  base := left(base, 24);
  -- Suffix full id (no hyphens) so username is globally unique even if handles collide.
  uname := base || '_' || replace(NEW.id::text, '-', '');

  INSERT INTO public.users (id, username, public_key, created_at, updated_at)
  VALUES (NEW.id, uname, '', now(), now())
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- One trigger per auth user creation (idempotent if re-run: drop first).
DROP TRIGGER IF EXISTS on_auth_user_created_sync_public_users ON auth.users;

CREATE TRIGGER on_auth_user_created_sync_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Inserts public.users when auth.users gains a row; username from raw_user_meta_data.username or email local-part + uuid suffix.';

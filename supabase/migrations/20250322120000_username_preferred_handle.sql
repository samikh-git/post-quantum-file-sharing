-- Prefer a clean public handle from auth metadata when valid and unused; otherwise keep
-- email-local + uuid suffix (stable fallback). Aligns with API `isValidUsername` / box slug rules.

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
  candidate text;
  uname text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE id NEW.id) THEN
    RETURN NEW;
  END IF;

  meta_username := NEW.raw_user_meta_data ->> 'username';
  candidate := NULL;
  IF meta_username IS NOT NULL AND length(trim(meta_username)) > 0 THEN
    candidate := lower(regexp_replace(trim(meta_username), '[^a-z0-9-]', '-', 'g'));
    candidate := regexp_replace(candidate, '-+', '-', 'g');
    candidate := trim(both '-' from candidate);
    IF length(candidate) < 3 OR length(candidate) > 48 OR candidate !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      candidate := NULL;
    END IF;
  END IF;

  IF candidate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE username = candidate) THEN
    uname := candidate;
  ELSE
    email_local := split_part(COALESCE(NEW.email, 'user'), '@', 1);
    base := lower(regexp_replace(email_local, '[^a-z0-9]', '_', 'g'));
    IF base IS NULL OR base = '' THEN
      base := 'user';
    END IF;
    base := left(base, 24);
    uname := base || '_' || replace(NEW.id::text, '-', '');
  END IF;

  BEGIN
    INSERT INTO public.users (id, username, public_key, created_at, updated_at)
    VALUES (NEW.id, uname, '', now(), now());
    RETURN NEW;
  EXCEPTION
    WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
        RETURN NEW;
      END IF;
      email_local := split_part(COALESCE(NEW.email, 'user'), '@', 1);
      base := lower(regexp_replace(email_local, '[^a-z0-9]', '_', 'g'));
      IF base IS NULL OR base = '' THEN
        base := 'user';
      END IF;
      base := left(base, 24);
      uname := base || '_' || replace(NEW.id::text, '-', '');
      INSERT INTO public.users (id, username, public_key, created_at, updated_at)
      VALUES (NEW.id, uname, '', now(), now());
      RETURN NEW;
  END;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Inserts public.users on new auth.users; username from raw_user_meta_data.username when valid+free, else email local-part + id suffix.';

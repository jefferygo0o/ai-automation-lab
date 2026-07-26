-- Phase 3: Enable Supabase Realtime on key tables.
-- Safe to re-run (idempotent via DO blocks).

-- chats — live chat list updates (title, last_message_at, etc.)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- messages — live message inserts during agent runs / automations
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- runs — live run status updates (running → completed / failed)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.runs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- approval_requests — live approval notifications
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- automations — live automation state changes (last_run_at, enabled)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

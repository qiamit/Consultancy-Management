-- QE Assistant (Admin Agent) memory: saved chats and the facts / standing instructions the admin asks it to
-- remember. Each admin sees only their own rows. The agent's generic table tools never see these tables
-- (qiAgent.mjs blocks assistant_*); it uses its own remember / forget tools.

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'New Chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx ON public.assistant_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  -- Admin Agent extras of an answer: steps taken, proposals, pages opened.
  agent jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx ON public.assistant_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.assistant_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'fact' CHECK (kind IN ('fact', 'instruction')),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_memories_user_idx ON public.assistant_memories (user_id, created_at);

-- Admin-only feature: an admin reads and writes only their own rows.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistant_conversations', 'assistant_messages', 'assistant_memories'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin())) WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()))',
      t || '_own', t
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- A message in another admin's conversation is refused even if its user_id is set to the caller.
CREATE OR REPLACE FUNCTION public.assistant_messages_own_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.assistant_conversations c WHERE c.id = NEW.conversation_id AND c.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501';
  END IF;
  UPDATE public.assistant_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assistant_messages_own_conversation ON public.assistant_messages;
CREATE TRIGGER assistant_messages_own_conversation
  BEFORE INSERT ON public.assistant_messages
  FOR EACH ROW EXECUTE FUNCTION public.assistant_messages_own_conversation();

-- Customers never read these tables.
SELECT public.app_apply_customer_lockout();

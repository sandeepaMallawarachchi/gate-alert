CREATE TABLE public.gate_alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_avatar text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gate_alert_history_created_at_idx ON public.gate_alert_history (created_at DESC);
ALTER TABLE public.gate_alert_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.gate_alert_history TO authenticated;
GRANT ALL ON public.gate_alert_history TO service_role;

-- Only active members can read today's requests (office timezone).
CREATE POLICY "Active members view today's gate alerts"
ON public.gate_alert_history FOR SELECT TO authenticated
USING (
  created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo'
  AND created_at < (date_trunc('day', now() AT TIME ZONE 'Asia/Colombo') + interval '1 day') AT TIME ZONE 'Asia/Colombo'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_active = true)
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_alert_history;

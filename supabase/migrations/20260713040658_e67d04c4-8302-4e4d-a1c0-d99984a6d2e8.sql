
CREATE TABLE public.push_dedupe (
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date, tag)
);

GRANT ALL ON public.push_dedupe TO service_role;

ALTER TABLE public.push_dedupe ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon: only service_role (edge function) uses this table.

CREATE TABLE public.shared_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  is_live boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.shared_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all shared locations"
  ON public.shared_locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own location"
  ON public.shared_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own location"
  ON public.shared_locations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own location"
  ON public.shared_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_shared_locations_updated_at
  BEFORE UPDATE ON public.shared_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_locations;
ALTER TABLE public.shared_locations REPLICA IDENTITY FULL;
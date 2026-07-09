
-- Company location (singleton row managed by admins)
CREATE TABLE public.company_location (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'Office',
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 100,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_location TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.company_location TO authenticated;
GRANT ALL ON public.company_location TO service_role;

ALTER TABLE public.company_location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view company location"
  ON public.company_location FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert company location"
  ON public.company_location FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update company location"
  ON public.company_location FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete company location"
  ON public.company_location FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_company_location_updated_at
  BEFORE UPDATE ON public.company_location
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attendance
CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  check_in_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

GRANT SELECT, INSERT, UPDATE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own attendance"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Haversine distance in meters
CREATE OR REPLACE FUNCTION public.haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r constant double precision := 6371000;
  dlat double precision;
  dlon double precision;
  a double precision;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
  RETURN 2 * r * asin(sqrt(a));
END;
$$;

-- Validate geofence + protect timestamps on insert/update
CREATE OR REPLACE FUNCTION public.validate_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  loc record;
  dist double precision;
BEGIN
  SELECT latitude, longitude, radius_meters INTO loc FROM public.company_location LIMIT 1;
  IF loc IS NULL THEN
    RAISE EXCEPTION 'Company location is not configured yet';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Force server date & only allow check-in on insert
    NEW.date := (now() AT TIME ZONE 'utc')::date;
    NEW.check_out_at := NULL;
    NEW.check_out_lat := NULL;
    NEW.check_out_lng := NULL;
    IF NEW.check_in_lat IS NULL OR NEW.check_in_lng IS NULL THEN
      RAISE EXCEPTION 'Location required to check in';
    END IF;
    dist := public.haversine_m(NEW.check_in_lat, NEW.check_in_lng, loc.latitude, loc.longitude);
    IF dist > loc.radius_meters THEN
      RAISE EXCEPTION 'Out of range: % meters from office', round(dist);
    END IF;
    NEW.check_in_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Protect existing check-in fields
    NEW.date := OLD.date;
    NEW.check_in_at := OLD.check_in_at;
    NEW.check_in_lat := OLD.check_in_lat;
    NEW.check_in_lng := OLD.check_in_lng;
    -- Only allow setting check-out once
    IF OLD.check_out_at IS NOT NULL THEN
      RAISE EXCEPTION 'Already checked out for this day';
    END IF;
    IF NEW.check_out_lat IS NULL OR NEW.check_out_lng IS NULL THEN
      RAISE EXCEPTION 'Location required to check out';
    END IF;
    dist := public.haversine_m(NEW.check_out_lat, NEW.check_out_lng, loc.latitude, loc.longitude);
    IF dist > loc.radius_meters THEN
      RAISE EXCEPTION 'Out of range: % meters from office', round(dist);
    END IF;
    NEW.check_out_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_validate
  BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.validate_attendance();

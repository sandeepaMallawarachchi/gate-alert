
CREATE OR REPLACE FUNCTION public.validate_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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
    NEW.date := OLD.date;
    NEW.check_in_at := OLD.check_in_at;
    NEW.check_in_lat := OLD.check_in_lat;
    NEW.check_in_lng := OLD.check_in_lng;
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

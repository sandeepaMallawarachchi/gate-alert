-- Allow anonymous users to look up email by username for login
CREATE POLICY "Anyone can lookup email by username for login"
ON public.profiles
FOR SELECT
TO anon
USING (true);
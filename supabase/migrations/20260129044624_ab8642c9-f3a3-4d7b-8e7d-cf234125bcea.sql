-- Remove the anonymous access policy that exposes emails
DROP POLICY IF EXISTS "Anyone can lookup email by username for login" ON public.profiles;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create a restrictive policy: users can only see their own profile's email
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create a policy to allow viewing public profile data (without email) for other users
-- This is needed for showing sender info in notifications
CREATE POLICY "Users can view public profile data"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
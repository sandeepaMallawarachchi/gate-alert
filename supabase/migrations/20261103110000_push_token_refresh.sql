-- Token upserts must be able to refresh an existing registration.
GRANT UPDATE ON public.fcm_tokens TO authenticated;
CREATE POLICY "Users can refresh their own push tokens"
ON public.fcm_tokens FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

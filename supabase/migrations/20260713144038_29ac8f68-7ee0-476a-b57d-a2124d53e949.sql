REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (email, onboarding_completed_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
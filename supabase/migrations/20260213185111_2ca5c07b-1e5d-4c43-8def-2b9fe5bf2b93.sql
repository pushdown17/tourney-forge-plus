
-- Fix: Add explicit INSERT policy on user_roles to restrict to admins only
-- This prevents privilege escalation where a regular user could insert an admin role for themselves
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

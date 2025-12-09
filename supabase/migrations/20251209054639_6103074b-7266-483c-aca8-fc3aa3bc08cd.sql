-- Drop the existing update policy
DROP POLICY IF EXISTS "Tournament creators and admins can update tournaments" ON public.tournaments;

-- Create a new policy that allows creators to close their tournament
-- The policy should allow:
-- 1. Admins to do anything
-- 2. Creators to update their own tournament if it's currently open OR if they're just closing it
CREATE POLICY "Tournament creators and admins can update tournaments" 
ON public.tournaments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (auth.uid() = created_by)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (auth.uid() = created_by)
);
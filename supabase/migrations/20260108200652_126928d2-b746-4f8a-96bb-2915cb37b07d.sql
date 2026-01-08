-- Use server time for cross-device timer sync
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

-- Tighten overly permissive UPDATE policy on referee_stations
DROP POLICY IF EXISTS "Anyone can update station match" ON public.referee_stations;

CREATE POLICY "Authenticated users can update station match"
ON public.referee_stations
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { ErrorState } from '../ui/ErrorState';

/**
 * The router's error boundary (`defaultErrorComponent`): a route that throws while rendering
 * shows this plain line inside the app shell instead of a blank page. Retry resets the boundary
 * and reloads the route.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <ErrorState
      what="this page"
      verb="show"
      error={error}
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}

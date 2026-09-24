import { HealthResponse } from '@mytube/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { apiGet } from '../api/client';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/api/health', HealthResponse),
  });

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold">MyTube</h1>
      <p className="mt-2 text-sm text-muted">
        {health.isPending && 'Checking the API…'}
        {health.isError && `API unreachable: ${health.error.message}`}
        {health.data && `API ${health.data.version} is ${health.data.status}.`}
      </p>
    </main>
  );
}

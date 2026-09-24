import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/PlaceholderPage';

export const Route = createFileRoute('/activity')({ component: ActivityPage });

function ActivityPage() {
  return (
    <PlaceholderPage title="Activity" sub="What is downloading now and what landed recently." />
  );
}

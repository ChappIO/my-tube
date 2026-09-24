import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/PlaceholderPage';

export const Route = createFileRoute('/')({ component: HomePage });

function HomePage() {
  return <PlaceholderPage title="What's new" sub="Across music and video, newest first." />;
}

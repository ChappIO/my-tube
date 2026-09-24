import { Link, createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage, PlaceholderTabs } from '../components/PlaceholderPage';

// `id` is an opaque channel id; it is passed to the API as is.
export const Route = createFileRoute('/video/channel/$id')({ component: ChannelPage });

function ChannelPage() {
  const { id } = Route.useParams();
  return (
    <PlaceholderPage title={`Channel ${id}`} sub="Nothing here yet.">
      <PlaceholderTabs>
        <Link to="/video/$tab" params={{ tab: 'channels' }}>
          ← Video
        </Link>
      </PlaceholderTabs>
    </PlaceholderPage>
  );
}

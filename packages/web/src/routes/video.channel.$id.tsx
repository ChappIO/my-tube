import { createFileRoute } from '@tanstack/react-router';
import { ChannelPage } from '../components/sources/ChannelPage';

// `id` is a source id; it is passed to the API as is (a non-numeric id reads as not found).
export const Route = createFileRoute('/video/channel/$id')({ component: ChannelRoute });

function ChannelRoute() {
  const { id } = Route.useParams();
  return <ChannelPage id={id} />;
}

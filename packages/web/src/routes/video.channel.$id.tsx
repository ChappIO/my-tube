import { createFileRoute, linkOptions } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { BackLink } from '../components/ui/BackLink';

// `id` is an opaque channel id; it is passed to the API as is.
export const Route = createFileRoute('/video/channel/$id')({ component: ChannelPage });

const backToChannels = linkOptions({ to: '/video/$tab', params: { tab: 'channels' } });

function ChannelPage() {
  const { id } = Route.useParams();
  return (
    <>
      <BackLink link={backToChannels}>Video</BackLink>
      <PlaceholderPage title={`Channel ${id}`} sub="Nothing here yet." />
    </>
  );
}

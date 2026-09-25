import { createFileRoute } from '@tanstack/react-router';
import { ArtistPage } from '../components/library/ArtistPage';

// `id` is an artist id; it is passed to the API as is (a non-numeric id reads as not found).
export const Route = createFileRoute('/music/artist/$id')({ component: ArtistRoute });

function ArtistRoute() {
  const { id } = Route.useParams();
  return <ArtistPage id={id} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { AlbumPage } from '../components/library/AlbumPage';

// `id` is an album id; it is passed to the API as is (a non-numeric id reads as not found).
export const Route = createFileRoute('/music/album/$id')({ component: AlbumRoute });

function AlbumRoute() {
  const { id } = Route.useParams();
  return <AlbumPage id={id} />;
}

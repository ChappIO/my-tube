import { createFileRoute } from '@tanstack/react-router';
import { HomeScreen } from '../components/library/HomeScreen';

export const Route = createFileRoute('/')({ component: HomeScreen });

import { createFileRoute } from '@tanstack/react-router';
import { ActivityScreen } from '../components/activity/ActivityScreen';

export const Route = createFileRoute('/activity')({ component: ActivityScreen });

import { useCancelJob, useCheckAll, useHistory, useQueue, useRetryJob } from '../../api/activity';
import { RefreshIcon } from '../icons';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { PageHeader } from '../ui/PageHeader';
import { Body, Meta } from '../ui/typography';
import { ActivityList, ActivitySection } from './ActivitySection';
import { HistoryTable } from './HistoryTable';
import { QueueRow } from './QueueRow';

/**
 * Screen 5, Activity: what is downloading now (the queue, polled every 2 s) and what landed
 * recently (the history, polled every 5 s). The outlined Check now button (addition to the
 * handoff) checks every subscribed source without waiting for the interval.
 */
export function ActivityScreen() {
  const queue = useQueue();
  const history = useHistory();
  const cancel = useCancelJob();
  const retry = useRetryJob();
  const checkAll = useCheckAll();

  const pendingId = cancel.isPending
    ? cancel.variables
    : retry.isPending
      ? retry.variables
      : undefined;

  let checkStatus: string | undefined;
  if (checkAll.isPending) checkStatus = 'Checking…';
  else if (checkAll.isError) checkStatus = 'Could not start the check.';
  else if (checkAll.data) {
    const count = checkAll.data.length;
    checkStatus =
      count === 0
        ? 'No subscriptions to check.'
        : `Checking ${count} source${count === 1 ? '' : 's'}.`;
  }

  const jobs = queue.data ?? [];
  return (
    <>
      <PageHeader
        title="Activity"
        sub="What is downloading now and what landed recently."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outlined"
              icon={<RefreshIcon />}
              disabled={checkAll.isPending}
              onClick={() => checkAll.mutate()}
            >
              Check now
            </Button>
            <div role="status">{checkStatus && <Meta>{checkStatus}</Meta>}</div>
          </div>
        }
      />
      <ActivitySection label={queue.data ? `Queue · ${jobs.length}` : 'Queue'}>
        {loadFailed(queue) ? (
          <ErrorState what="the queue" {...fromQuery(queue)} />
        ) : queue.data === undefined ? (
          <Body muted>Loading the queue.</Body>
        ) : jobs.length === 0 ? (
          <EmptyState>Queue is empty.</EmptyState>
        ) : (
          <ActivityList>
            {jobs.map((job) => (
              <QueueRow
                key={job.id}
                job={job}
                busy={pendingId === job.id}
                onCancel={(id) => cancel.mutate(id)}
                onRetry={(id) => retry.mutate(id)}
              />
            ))}
          </ActivityList>
        )}
      </ActivitySection>
      <ActivitySection label="History">
        {loadFailed(history) ? (
          <ErrorState what="the history" {...fromQuery(history)} />
        ) : history.data === undefined ? (
          <Body muted>Loading the history.</Body>
        ) : history.data.length === 0 ? (
          <EmptyState>No history yet.</EmptyState>
        ) : (
          <HistoryTable entries={history.data} />
        )}
      </ActivitySection>
    </>
  );
}

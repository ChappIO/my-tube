import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { cookiesValueText, useCookiesAction, useCookiesStatus } from '../../api/cookies';
import { useNow } from '../../use-now';
import { Button } from '../ui/Button';
import { FileButton } from '../ui/FileButton';
import { KeyValueRow, KeyValueText } from '../ui/KeyValueGrid';
import { SettingsNote } from '../ui/SettingsCard';
import { TextAction } from '../ui/TextAction';
import { TextValueInput } from '../ui/TextValueInput';
import { Meta } from '../ui/typography';
import { CookiesHelpModal } from './CookiesHelpModal';
import { CookiesPasteModal } from './CookiesPasteModal';
import { validateNetworkField } from './NetworkCard';
import { textOrNull } from './fields';

export interface CookiesRowProps {
  /** Saves `network.cookiesFile` typed by hand (a mounted file), or null to clear it. */
  onPathChange: (path: string | null) => void;
}

/**
 * Settings → Advanced → Network → Cookies. The managed file (`/config/cookies.txt`) reads
 * `12 cookies · youtube.com, google.com · updated 2 h ago`; Upload and Paste replace it, Remove
 * deletes it, and "How to export cookies" opens the help. Without the managed file the value is
 * the path box: `not set`, or the path of a mounted file set by hand, with a note that an upload
 * replaces it. API errors show under the row (inside the Paste modal while it is open).
 */
export function CookiesRow({ onPathChange }: CookiesRowProps) {
  const status = useCookiesStatus();
  const action = useCookiesAction();
  const now = useNow();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const cookies = status.data;
  const managed = cookies?.managed === true;
  const error = action.isError
    ? apiErrorMessage(action.error, 'Could not save the cookies file.')
    : undefined;

  const openPaste = () => {
    action.reset();
    setPasteOpen(true);
  };

  return (
    <KeyValueRow label="Cookies" control={!managed} align="start">
      <div className="grid gap-[10px]">
        {!cookies ? (
          <KeyValueText>{status.isError ? 'could not load' : '…'}</KeyValueText>
        ) : managed ? (
          <KeyValueText>{cookiesValueText(cookies, now)}</KeyValueText>
        ) : (
          <TextValueInput
            value={cookies.path ?? ''}
            placeholder="not set"
            validate={(text) => validateNetworkField('cookiesFile', text)}
            onCommit={(text) => onPathChange(textOrNull(text))}
          />
        )}
        {cookies && !managed && cookies.path !== null && (
          <SettingsNote size="small">Set by path; upload replaces it.</SettingsNote>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <FileButton
            variant="outlined"
            accept=".txt,text/plain"
            disabled={action.isPending}
            onFile={(file) => action.mutate({ upload: file })}
          >
            Upload
          </FileButton>
          <Button variant="outlined" disabled={action.isPending} onClick={openPaste}>
            Paste
          </Button>
          {managed && (
            <Button
              variant="outlined"
              disabled={action.isPending}
              onClick={() => action.mutate({ remove: true })}
            >
              Remove
            </Button>
          )}
          <TextAction className="ml-1" onClick={() => setHelpOpen(true)}>
            How to export cookies
          </TextAction>
        </div>
        {/* Always rendered so screen readers announce a new error. */}
        <div role="alert">
          {error && !pasteOpen && (
            <Meta as="p" tone="red">
              {error}
            </Meta>
          )}
        </div>
      </div>
      {pasteOpen && (
        <CookiesPasteModal
          open
          onClose={() => {
            action.reset();
            setPasteOpen(false);
          }}
          saving={action.isPending}
          error={error}
          onSave={(text) =>
            action.mutate({ upload: text }, { onSuccess: () => setPasteOpen(false) })
          }
        />
      )}
      <CookiesHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </KeyValueRow>
  );
}

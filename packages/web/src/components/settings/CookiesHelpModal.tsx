import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { Step, Steps } from '../ui/Steps';
import { TextLink } from '../ui/TextLink';
import { Body, SectionLabel } from '../ui/typography';

/** "Get cookies.txt LOCALLY" on the Chrome Web Store (Chrome, Chromium, Edge, Brave). */
export const CHROME_EXPORTER_URL =
  'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc';
/** "cookies.txt" on addons.mozilla.org. */
export const FIREFOX_EXPORTER_URL = 'https://addons.mozilla.org/firefox/addon/cookies-txt/';
/** yt-dlp's FAQ entry on passing cookies. */
export const YTDLP_COOKIES_FAQ_URL =
  'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp';

export interface CookiesHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "Export cookies from your browser": how to make the cookies file, following yt-dlp's own
 * advice (a private window that is closed right after the export, so YouTube does not rotate
 * the exported cookies away).
 */
export function CookiesHelpModal({ open, onClose }: CookiesHelpModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Export cookies from your browser">
      <Steps>
        <Step title="Why.">
          YouTube sometimes asks for a sign-in or a bot check before it serves a video. A cookies
          file makes yt-dlp look like your signed-in browser. yt-dlp cannot read a browser from
          inside the container (--cookies-from-browser), so it needs the file.
        </Step>
        <Step title="Install an exporter.">
          Chrome, Chromium, Edge or Brave:{' '}
          <TextLink href={CHROME_EXPORTER_URL}>Get cookies.txt LOCALLY</TextLink>. Firefox:{' '}
          <TextLink href={FIREFOX_EXPORTER_URL}>cookies.txt</TextLink>. Allow it in private windows.
        </Step>
        <Step title="Use a throwaway session.">
          Open a private (incognito) window and sign in to youtube.com. Open a new tab in that
          window and close the YouTube tab.
        </Step>
        <Step title="Export.">
          From the new tab, export the cookies for youtube.com in Netscape format (cookies.txt),
          then close the private window right away. Do not use it for anything else: YouTube rotates
          the cookies of an open session and the exported file stops working.
        </Step>
        <Step title="Upload or paste it here.">
          Upload the file, or Paste its text. MyTube checks that it holds YouTube or Google cookies.
        </Step>
      </Steps>
      <div className="grid gap-2">
        <SectionLabel as="h3">Notes</SectionLabel>
        <Body>
          Cookies expire after a few weeks. When downloads start failing with a sign-in or bot
          message, export again. MyTube stores the file as /config/cookies.txt, readable by its own
          user only, never shows its contents, and leaves it out of backups. Downloads with cookies
          run as your Google account, so keep the rate limit reasonable. See{' '}
          <TextLink href={YTDLP_COOKIES_FAQ_URL}>yt-dlp's own guidance</TextLink>.
        </Body>
      </div>
      <ModalActions>
        <Button variant="secondary" size="lg" onClick={onClose}>
          Close
        </Button>
      </ModalActions>
    </Modal>
  );
}

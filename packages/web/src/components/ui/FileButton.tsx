import { useRef } from 'react';
import { Button, type ButtonProps } from './Button';

export interface FileButtonProps extends Omit<ButtonProps, 'onClick' | 'type'> {
  /** The native `accept` list, for example `.txt,text/plain`. */
  accept?: string;
  /** Called with the picked file. Picking the same file again calls it again. */
  onFile: (file: File) => void;
}

/** A `Button` that opens the file picker: a hidden file input behind it. */
export function FileButton({ accept, onFile, children, ...props }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...props} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear it so choosing the same file again fires another change.
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}

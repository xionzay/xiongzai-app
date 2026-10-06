import type { InputHTMLAttributes, ReactNode } from 'react';
import { CartoonIcon } from './CartoonIcon';

/** Keep the native file input focusable and operable; only its visual chrome is replaced. */
export function ThemedFilePicker({ children, ...inputProps }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'children'> & { children: ReactNode }) {
  return <label className="toon-file-picker">
    <CartoonIcon kind="share" />
    <span>{children}</span>
    <input {...inputProps} type="file" />
  </label>;
}

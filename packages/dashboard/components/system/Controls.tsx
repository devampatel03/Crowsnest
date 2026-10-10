'use client';

import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/format';
import { Kbd } from './Kbd';

const FIELD =
  'h-11 w-full rounded-ctl border border-field bg-input px-s3 font-sans text-[0.9375rem] text-fg placeholder:text-fg-mute';

/** Native select (keyboard, mobile pickers and surface tokens all come free). Visible label above. */
export function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-s1">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(FIELD, 'appearance-none pr-s5')}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-s3 top-1/2 -translate-y-1/2 text-[0.75rem] text-fg-mute">
          ↓
        </span>
      </div>
    </div>
  );
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  shortcut,
  inputRef,
  className,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  shortcut?: string;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const hintId = `${id}-hint`;
  const errId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errId : null, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-s1">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-keyshortcuts={shortcut}
          className={cn(FIELD, shortcut && 'pr-s6', error && 'border-hold', className)}
        />
        {shortcut ? (
          <span aria-hidden="true" className="absolute right-s2 top-1/2 -translate-y-1/2">
            <Kbd keys={[shortcut]} />
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="m-0 text-body-s text-fg-mute">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="m-0 text-body-s text-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Filter toggle; wrap a Gauge as children for seriousness filters. Pressed = filled step, not a beam fill. */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  onPressedChange: (b: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className="chip"
    >
      {children}
    </button>
  );
}

/** Two or three exclusive options. Buttons with aria-pressed inside a labelled group. */
export function SegmentedToggle({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const gid = useId();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      id={gid}
      className="seg"
      style={{ '--n': options.length, '--i': Math.max(0, options.findIndex((o) => o.value === value)) } as CSSProperties}
    >
      <span aria-hidden="true" className="seg-thumb" />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className="seg-opt">
          {o.label}
        </button>
      ))}
    </div>
  );
}

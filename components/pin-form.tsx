'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { type AuthFormState } from '@/app/actions/auth';
import { TAP_TARGET } from '@/components/shell';

/**
 * The PIN keypad screen.
 *
 * Everything here is a decision about a thumb on an iPhone:
 *
 * - **One field, not six boxes.** Six single-character inputs look tidy and are
 *   miserable one-handed: the caret jumps, backspace behaves differently in
 *   each box, and iOS autofill fights them. One field with `inputMode="numeric"`
 *   gets the number pad and behaves the way every other number entry does.
 * - **`type="password"`** so a PIN is not readable over a shoulder, with
 *   `autoComplete` set so Safari offers the saved value on return visits rather
 *   than a card number.
 * - **Font size ≥16px**, enforced globally in `globals.css`, because Safari
 *   zooms the viewport on focus below that and the layout jumps.
 * - **The button is full width and 44px+**, at the bottom, in reach.
 *
 * Errors render in place and never clear the screen: a wrong PIN should cost
 * one tap to correct, not a reload.
 */

export function PinForm({
  action,
  userId,
  submitLabel,
  confirm = false,
  requireClaimCode = false,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  userId: string;
  submitLabel: string;
  confirm?: boolean;
  requireClaimCode?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <input type="hidden" name="userId" value={userId} />

      <PinField
        name="pin"
        label={confirm ? 'Choose six digits' : 'Your six digits'}
        autoFocus
        autoComplete={confirm ? 'new-password' : 'current-password'}
      />

      {confirm && (
        <PinField name="confirm" label="Again, so Tony knows you meant it" autoComplete="new-password" />
      )}

      {requireClaimCode && (
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.18em] text-ink-100 uppercase">
            Tony&rsquo;s code
          </span>
          <input
            name="claimCode"
            type="text"
            inputMode="text"
            autoComplete="off"
            className={`mt-1.5 w-full ${TAP_TARGET} rounded-sm border border-wood-dark bg-paper-white px-3 py-3 text-ink-900`}
          />
        </label>
      )}

      {state.error !== undefined && (
        <p
          role="alert"
          className="border-l-4 border-red-mid bg-red-dark/20 px-3 py-2.5 text-[15px] leading-snug text-paper-white"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`flex w-full ${TAP_TARGET} min-h-[3.25rem] items-center justify-center rounded-sm bg-amber-mid px-5 text-[17px] font-bold text-ink-900 transition-opacity active:opacity-80 disabled:opacity-60`}
      >
        {pending ? 'One moment…' : submitLabel}
      </button>

      <Link
        href="/door"
        className={`flex ${TAP_TARGET} items-center justify-center text-sm text-ink-100 underline underline-offset-4`}
      >
        That&rsquo;s not me
      </Link>
    </form>
  );
}

function PinField({
  name,
  label,
  autoComplete,
  autoFocus = false,
}: {
  name: string;
  label: string;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] tracking-[0.18em] text-ink-100 uppercase">
        {label}
      </span>
      <input
        name={name}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        minLength={6}
        required
        autoComplete={autoComplete}
        // Single-purpose screen, reached by an explicit tap on a name: the
        // keypad should already be up when it paints.
        autoFocus={autoFocus}
        className={`mt-1.5 w-full ${TAP_TARGET} rounded-sm border border-wood-dark bg-paper-white px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink-900`}
      />
    </label>
  );
}

import { notFound, redirect } from 'next/navigation';

import { PinForm } from '@/components/pin-form';
import { HangingSign, ShopWindow } from '@/components/scene/fixtures';
import { SignPlate } from '@/components/scene/panel';
import { ParlorAir } from '@/components/scene/backdrop';
import { Page } from '@/components/shell';
import { claimAction, signInAction } from '@/app/actions/auth';
import { TYPE } from '@/lib/design/type';
import { viewer } from '@/lib/auth/current-user';
import { doorManager } from '@/lib/auth/service';
import { getDb } from '@/lib/db';

/**
 * Set a PIN, or enter one.
 *
 * The same screen does both, because from the manager's side it is the same
 * action — "let me in" — and which one they get depends on a fact about their
 * account rather than a choice they should have to make.
 *
 * `09 §8.2`: never store a plaintext PIN, hash it slowly, rate limit, lock out
 * repeated failures. All of that lives in `lib/auth/`; this page renders a
 * keypad on the door.
 */

export const dynamic = 'force-dynamic';

export default async function DoorManagerPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  if ((await viewer()) !== null) redirect('/');

  const { userId } = await params;
  const manager = await doorManager(getDb(), userId);

  // A manager who holds no seat this season is not on the door. `notFound()`
  // rather than a message: there is nothing useful to say, and nothing to be
  // learned from the difference.
  if (manager === null) notFound();

  const claiming = !manager.claimed;
  const needsCode = claiming && (process.env['CLAIM_CODE'] ?? '') !== '';

  return (
    <>
      <ParlorAir tone="cold" />

      <Page>
        <header className="relative h-24 overflow-hidden border-b-2 border-wood-dark">
          <ShopWindow />
          <HangingSign top="Closed" bottom="back in september" />
        </header>

        <main className="mx-auto w-full max-w-md flex-1 px-5 pt-7">
          <SignPlate tone={claiming ? 'red' : 'blue'}>
            {claiming ? 'New key' : 'Welcome back'}
          </SignPlate>
          <h1 className={`mt-4 ${TYPE.headlineQuiet} text-paper-white`}>
            {manager.displayName}
          </h1>
          <p className={`mt-2 ${TYPE.bodyLead} text-ink-100`}>
            {claiming
              ? 'Pick six digits you will remember. Tony never sees them — not even the commissioner can look them up.'
              : 'Six digits and the door opens.'}
          </p>

          <PinForm
            action={claiming ? claimAction : signInAction}
            userId={manager.id}
            submitLabel={claiming ? 'Cut me a key' : 'Let me in'}
            confirm={claiming}
            requireClaimCode={needsCode}
          />

          {claiming && (
            <p className={`mt-6 pb-6 ${TYPE.body} text-ink-300`}>
              Six digits, not four. Ten names on a door and four digits is ten thousand guesses —
              Tony would rather not find out who tries.
            </p>
          )}
        </main>
      </Page>
    </>
  );
}

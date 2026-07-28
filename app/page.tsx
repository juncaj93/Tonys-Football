import Link from 'next/link';

import { assetRegistry } from '@/lib/assets/registry';

export default function HomePage() {
  const total = assetRegistry.size;
  const placeholders = assetRegistry.byStatus('placeholder').length;

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-between px-5"
      style={{
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="pt-10">
        <p className="font-mono text-xs tracking-[0.2em] text-amber-mid uppercase">
          Phase 0 · Foundation
        </p>
        <h1 className="mt-3 text-3xl leading-tight font-bold text-paper-white sm:text-4xl">
          Tony&rsquo;s Pizza Fantasy
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-100">
          A private clubhouse that remembers. Closed for renovation.
        </p>

        <div className="mt-8 rounded-sm border border-ink-500 bg-ink-700/60 p-4">
          <p className="text-sm leading-relaxed text-ink-100">
            The asset registry is live. All{' '}
            <span className="font-semibold text-paper-white">{total}</span> slugs resolve,{' '}
            <span className="font-semibold text-paper-white">{placeholders}</span> of them to
            placeholders. No artwork exists yet, and every screen still renders.
          </p>
        </div>

        <Link
          href="/dev/assets"
          className="mt-6 flex min-h-[3rem] w-full items-center justify-center rounded-sm bg-amber-mid px-5 font-semibold text-ink-900 transition-opacity active:opacity-80"
        >
          Open the asset inventory
        </Link>
      </div>

      <footer className="pt-12 pb-2">
        <p className="text-xs leading-relaxed text-ink-500">
          No database, no authentication, no Sleeper integration, no shop. Those arrive in
          later slices.
        </p>
      </footer>
    </main>
  );
}

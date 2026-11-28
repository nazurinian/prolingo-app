import React, { useState } from 'react';
import App from '../../../App.jsx';
import BookQaHost from './BookQaHost.jsx';
import { isBookQaOrigin } from '../../../services/bookQaSessionService.js';

const tabs = [['table-uat', 'Table'], ['legacy-uat', 'Legacy'], ['book-qa', 'Book']];
const hrefFor = tab => {
  const source = new URL(window.location.href);
  const next = new URLSearchParams({ qa: tab });
  if (source.searchParams.has('db')) next.set('db', source.searchParams.get('db'));
  return '/?' + next;
};

export default function BookUatTabs({ initialTab }) {
  const [tableOptIn, setTableOptIn] = useState(false);
  const allowed = isBookQaOrigin(window.location.origin);
  const navigation = <nav aria-label="UAT modes" data-uat-tabs className="flex gap-1 border-b border-slate-200 bg-white px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
    {tabs.map(([tab, label]) => <a key={tab} href={hrefFor(tab)} aria-current={tab === initialTab ? 'page' : undefined}
      onClick={event => { event.currentTarget.href = hrefFor(tab); }}
      className={'rounded px-3 py-1.5 ' + (tab === initialTab ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-white' : 'text-slate-700 dark:text-slate-200')}>
      {label}
    </a>)}
  </nav>;
  if (initialTab === 'book-qa') return <BookQaHost uatTabSlot={navigation} />;
  if (allowed && initialTab === 'table-uat' && tableOptIn) return <App uatTable uatTabSlot={navigation} />;
  return <>
    {navigation}
    <main className="mx-auto max-w-2xl space-y-3 p-5 text-slate-900 dark:text-slate-100">
      {initialTab === 'legacy-uat' ? <>
        <h1 className="text-xl font-bold">Legacy · UAT</h1>
        <p data-uat-legacy-gate>The existing Legacy startup may initialize or backfill Text v1. Live Legacy access is gated in this UAT shell.</p>
      </> : <>
        <h1 className="text-xl font-bold">Table · UAT</h1>
        <p>Open the existing Table workspace and its storage on this testing origin.</p>
        {!allowed && <p role="alert">Use the approved UAT origin or a supported loopback origin.</p>}
        <button type="button" disabled={!allowed} onClick={() => setTableOptIn(true)}
          className="min-h-10 rounded bg-indigo-600 px-3 font-semibold text-white disabled:opacity-45">Open Table workspace</button>
      </>}
    </main>
  </>;
}

/* global __TEXT_UAT_ENABLED__ */
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const LazyConversationEditorQaPreview = import.meta.env.DEV ? lazy(() => (
  import('./components/text/conversation/TextConversationEditorQaPreview.jsx')
)) : null

const LazySharedCardReaderQaPreview = import.meta.env.DEV ? lazy(() => (
  import('./components/text/presentation/TextSharedCardReaderQaPreview.jsx')
)) : null

const LazySharedConversationReaderQaPreview = import.meta.env.DEV ? lazy(() => (
  import('./components/text/presentation/TextSharedConversationReaderQaPreview.jsx')
)) : null

const LazyMixedWorkspaceQaPreview = import.meta.env.DEV ? lazy(() => (
  import('./components/text/presentation/TextMixedWorkspaceQaPreview.jsx')
)) : null

const LazyDataManagementQaPreview = import.meta.env.DEV ? lazy(() => (
  import('./components/text/management/TextDataManagementQaPreview.jsx')
)) : null
const LazyStructuredTextDemo = import.meta.env.DEV ? lazy(() => import('./components/text/presentation/StructuredTextDemo.jsx')) : null
const textUatEnabled = typeof __TEXT_UAT_ENABLED__ !== 'undefined' && __TEXT_UAT_ENABLED__
const LazyStructuredTextBeta = (import.meta.env.DEV || textUatEnabled) ? lazy(() => import('./components/text/management/StructuredTextBeta.jsx')) : null

const getActiveQaRoute = () => {
  if (typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search || '')
  const qa = search.get('qa')
  if (textUatEnabled) return qa === 'text-beta' ? 'text-beta' : 'uat-landing'
  if (!import.meta.env.DEV) return null
  if (qa === 'structured-text') return 'structured-text'
  if (qa === 'text-beta') return 'text-beta'
  if (qa === 'conversation-editor' || window.location.hash === '#qa-conversation-editor') {
    return 'conversation-editor'
  }
  if (qa === 'shared-card-reader' || window.location.hash === '#qa-shared-card-reader') {
    return 'shared-card-reader'
  }
  if (qa === 'shared-conversation-reader' || window.location.hash === '#qa-shared-conversation-reader') {
    return 'shared-conversation-reader'
  }
  if (qa === 'mixed-workspace' || window.location.hash === '#qa-mixed-workspace') {
    return 'mixed-workspace'
  }
  if (
    qa === 'data-management'
    || qa === 'structured-data-management'
    || window.location.hash === '#qa-data-management'
    || window.location.hash === '#qa-structured-data-management'
  ) {
    return 'data-management'
  }
  return null
}

const activeQaRoute = getActiveQaRoute()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {activeQaRoute === 'uat-landing' ? (
      <main className="p-6"><h1>ProLingo Text v2 UAT</h1><p>Isolated Beta Testing — not Stable. Canonical library remains unchanged.</p><a href="/?qa=text-beta">Open isolated Text v2 UAT</a></main>
    ) : activeQaRoute === 'text-beta' ? (
      <Suspense fallback={<div>Loading isolated Beta...</div>}><LazyStructuredTextBeta /></Suspense>
    ) : activeQaRoute === 'structured-text' ? (
      <Suspense fallback={<div>Loading isolated Structured Text...</div>}><LazyStructuredTextDemo /></Suspense>
    ) : activeQaRoute === 'conversation-editor' ? (
      <Suspense fallback={<div className="p-6 text-xs font-bold text-slate-500">Loading Conversation Editor QA Preview...</div>}>
        <LazyConversationEditorQaPreview />
      </Suspense>
    ) : activeQaRoute === 'shared-card-reader' ? (
      <Suspense fallback={<div className="p-6 text-xs font-bold text-slate-500">Loading Shared Card Reader QA Preview...</div>}>
        <LazySharedCardReaderQaPreview />
      </Suspense>
    ) : activeQaRoute === 'shared-conversation-reader' ? (
      <Suspense fallback={<div className="p-6 text-xs font-bold text-slate-500">Loading Conversation Reader QA Preview...</div>}>
        <LazySharedConversationReaderQaPreview />
      </Suspense>
    ) : activeQaRoute === 'mixed-workspace' ? (
      <Suspense fallback={<div className="p-6 text-xs font-bold text-slate-500">Loading Mixed Workspace QA...</div>}>
        <LazyMixedWorkspaceQaPreview />
      </Suspense>
    ) : activeQaRoute === 'data-management' ? (
      <Suspense fallback={<div className="p-6 text-xs font-bold text-slate-500">Loading Structured Text Data Management QA...</div>}>
        <LazyDataManagementQaPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)

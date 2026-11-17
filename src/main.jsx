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

const getActiveQaRoute = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search || '')
  const qa = search.get('qa')
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
  return null
}

const activeQaRoute = getActiveQaRoute()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {activeQaRoute === 'conversation-editor' ? (
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
    ) : (
      <App />
    )}
  </StrictMode>,
)

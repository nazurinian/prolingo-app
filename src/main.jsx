import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const LazyConversationEditorQaPreview = lazy(() => (
  import('./components/text/conversation/TextConversationEditorQaPreview.jsx')
))

const isConversationEditorQaRoute = () => {
  if (typeof window === 'undefined') return false
  const search = new URLSearchParams(window.location.search || '')
  return search.get('qa') === 'conversation-editor' || window.location.hash === '#qa-conversation-editor'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isConversationEditorQaRoute() ? (
      <Suspense fallback={<div className="p-6 text-xs font-bold text-slate-500">Loading Conversation Editor QA Preview...</div>}>
        <LazyConversationEditorQaPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)

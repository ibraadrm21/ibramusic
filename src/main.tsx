import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { LanguageProvider } from './context/LanguageContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><LanguageProvider><App /></LanguageProvider></AppErrorBoundary>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => {
    console.warn('IbraMusic: no se pudo iniciar la caché de la aplicación.', error);
  });
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, { once: true });
}

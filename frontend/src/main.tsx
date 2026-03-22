import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import App from './App.tsx'
import AboutPage from './pages/AboutPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import UploadPage from './pages/UploadPage.tsx'
import UserPage from './pages/UserPage.tsx'
import AppFooter from './components/AppFooter.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="app-shell">
        <div className="app-shell__main">
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/user" element={<UserPage />} />
            <Route path="/drop/:username/:slug" element={<UploadPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
        <AppFooter />
      </div>
    </BrowserRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { LanguageProvider } from './contexts/LanguageContext.jsx'
import { PermissionProvider } from './contexts/PermissionContext.jsx'
import { PermissionsProvider } from './contexts/PermissionsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <PermissionProvider>
          <PermissionsProvider>
          <App />
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#131318',
                color: '#F4F4F5',
                border: '1px solid #2D3050',
                borderRadius: '14px',
                fontFamily: "'Outfit', 'IBM Plex Sans Arabic', sans-serif",
                fontSize: '14px',
                padding: '12px 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              },
              success: { iconTheme: { primary: '#4ADE80', secondary: '#09090B' } },
              error: { iconTheme: { primary: '#F87171', secondary: '#09090B' } },
            }}
          />
          </PermissionsProvider>
        </PermissionProvider>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)

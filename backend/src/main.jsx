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
        </PermissionsProvider>
        </PermissionProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#141414',
              color: '#F9FAFB',
              border: '1px solid #242424',
              borderRadius: '12px',
              fontFamily: 'Cairo, sans-serif',
            },
            success: { iconTheme: { primary: '#4ADE80', secondary: '#0A0A0A' } },
            error: { iconTheme: { primary: '#F87171', secondary: '#0A0A0A' } },
          }}
        />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)

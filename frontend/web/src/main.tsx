import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { AuthProvider } from '@/hooks/useAuth'
import { ModuleAccessProvider } from '@/features/settings/module-access/ModuleAccessProvider'
import { AppThemeProvider } from '@/lib/AppThemeProvider'
import { OrgDisplaySettingsSync } from '@/features/settings/OrgDisplaySettingsSync'
import { AppDateFormatProvider } from '@/lib/AppDateFormatProvider'
import { AppCurrencyProvider } from '@/lib/AppCurrencyProvider'
import { registerServiceWorker } from '@/lib/registerServiceWorker'
import './styles/appThemes.css'
import './index.css'
import './styles/iosTheme.css'
import App from './App.tsx'
import { startAutoCardLabels } from '@/lib/autoCardLabels'
import { showPreviewChannelBadge } from '@/lib/previewChannelBadge'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <AppDateFormatProvider>
            <AppCurrencyProvider>
              <AuthProvider>
                <OrgDisplaySettingsSync />
                <ModuleAccessProvider>
                  <App />
                  <Toaster richColors position="top-right" />
                </ModuleAccessProvider>
              </AuthProvider>
            </AppCurrencyProvider>
          </AppDateFormatProvider>
        </AppThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)

startAutoCardLabels()
registerServiceWorker()
showPreviewChannelBadge()

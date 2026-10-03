import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/hooks/useAuth'
import { ModuleAccessProvider } from '@/features/settings/module-access/ModuleAccessProvider'
import { AppThemeProvider } from '@/lib/AppThemeProvider'
import { AppDateFormatProvider } from '@/lib/AppDateFormatProvider'
import { AppCurrencyProvider } from '@/lib/AppCurrencyProvider'
import './styles/appThemes.css'
import './index.css'
import App from './App.tsx'

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
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <AppDateFormatProvider>
          <AppCurrencyProvider>
            <AuthProvider>
              <ModuleAccessProvider>
                <App />
                <Toaster richColors position="top-right" />
              </ModuleAccessProvider>
            </AuthProvider>
          </AppCurrencyProvider>
        </AppDateFormatProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)

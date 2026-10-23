import { Component, type ErrorInfo, type ReactNode } from 'react'
import { limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

/**
 * Catches render errors so the shell is not a blank white page.
 * Class component is required — React does not catch these with hooks.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error.message, info.componentStack)
  }

  private reload = () => {
    window.location.reload()
  }

  private clearAndHome = () => {
    this.setState({ error: null })
    window.location.assign('/')
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-stone-100 p-4 text-stone-900">
        <div className="w-full max-w-md space-y-4 border-2 border-stone-500 bg-white p-5 shadow-sm ring-1 ring-amber-700/20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Consultancy Pro
            </p>
            <h1 className="mt-1 text-lg font-semibold text-stone-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-stone-600">
              The page hit an unexpected error. Your data on the server is unchanged. Reload the
              page, or go home and try again.
            </p>
          </div>
          {import.meta.env.DEV ? (
            <pre className="max-h-40 overflow-auto border border-stone-300 bg-stone-50 p-2 text-[11px] text-stone-700">
              {this.state.error.message}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(limsPrimaryBtnClass, 'min-h-10 px-4')} onClick={this.reload}>
              Reload page
            </button>
            <button type="button" className={cn(limsOutlineBtnClass, 'min-h-10 px-4')} onClick={this.clearAndHome}>
              Go home
            </button>
          </div>
        </div>
      </div>
    )
  }
}

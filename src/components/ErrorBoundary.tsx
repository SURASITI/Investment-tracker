import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-white">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
            <pre className="text-red-400 text-sm">{this.state.error?.message}</pre>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

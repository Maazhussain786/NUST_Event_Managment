'use client';

import { useEffect } from 'react';

export default function ManageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Society manage error boundary:', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Management Console Error</h2>
        <p className="text-gray-500 text-sm">
          Something went wrong in the management console. Your changes are safe — try again.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono">Ref: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            Retry
          </button>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

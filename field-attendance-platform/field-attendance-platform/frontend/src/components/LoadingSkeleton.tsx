import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = 'h-4 bg-slate-200 rounded' }: SkeletonProps) {
  return <div className={`animate-pulse ${className}`} />;
}

export function LoadingPageSkeleton({ message = 'Loading application...' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <h3 className="text-base font-semibold text-slate-800">{message}</h3>
        <p className="text-xs text-slate-500">Connecting securely to Ncode IT Division Platform...</p>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 bg-slate-200 rounded w-5/6 mx-auto" />
          <Skeleton className="h-3 bg-slate-100 rounded w-4/6 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div role="status" aria-label="Loading card content" className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-200 rounded w-1/6" />
      </div>
      <div className="h-8 bg-slate-200 rounded w-1/2" />
      <div className="space-y-2">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-4/5" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading table data" className="w-full space-y-3 animate-pulse">
      <div className="h-10 bg-slate-200 rounded w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-slate-100 rounded w-full flex items-center px-4 gap-4">
          <div className="h-4 bg-slate-200 rounded w-1/4" />
          <div className="h-4 bg-slate-200 rounded w-1/4" />
          <div className="h-4 bg-slate-200 rounded w-1/4" />
          <div className="h-4 bg-slate-200 rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}

export default LoadingPageSkeleton;

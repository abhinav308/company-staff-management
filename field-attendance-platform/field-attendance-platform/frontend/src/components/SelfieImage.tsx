import { useEffect, useState } from 'react';
import api from '../services/api';

/** Selfies are behind an authenticated endpoint, so fetch as a blob (a plain <img src> cannot send the JWT). */
export default function SelfieImage({ sessionId, className = 'h-40 w-40' }: { sessionId: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    api.get(`/attendance/sessions/${sessionId}/selfie/`, { responseType: 'blob' })
      .then((r) => { if (alive) { url = URL.createObjectURL(r.data); setSrc(url); } })
      .catch(() => setSrc(null));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [sessionId]);
  return src ? (
    <img src={src} alt="Punch-in selfie" className={`${className} rounded-xl object-cover`} />
  ) : (
    <div className={`${className} rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 p-2 text-center`}>
      <svg className="w-8 h-8 mb-1 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span className="text-[10px] font-medium">No photo recorded</span>
    </div>
  );
}

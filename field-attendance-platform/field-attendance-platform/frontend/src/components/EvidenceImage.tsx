import { useEffect, useState } from 'react';
import api from '../services/api';

interface EvidenceImageProps {
  visitId: number;
  photoId: number;
  caption?: string;
  className?: string;
  onClick?: () => void;
}

/** Evidence photos are behind an authenticated endpoint, so fetch as blob with JWT headers */
export default function EvidenceImage({
  visitId,
  photoId,
  caption,
  className = 'h-32 w-full',
  onClick,
}: EvidenceImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    setLoading(true);

    api
      .get(`/attendance/visits/${visitId}/photos/${photoId}/`, { responseType: 'blob' })
      .then((r) => {
        if (alive) {
          url = URL.createObjectURL(r.data);
          setSrc(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setSrc(null);
          setLoading(false);
        }
      });

    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [visitId, photoId]);

  if (loading) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-100 animate-pulse flex items-center justify-center text-slate-400 text-xs`}
      >
        <span>Loading...</span>
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 p-2 text-center`}
      >
        <svg className="w-6 h-6 mb-1 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="text-[10px]">Image Unavailable</span>
      </div>
    );
  }

  return (
    <div
      className={`relative group overflow-hidden rounded-xl border border-slate-200 bg-slate-900 ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      <img
        src={src}
        alt={caption || 'Field visit evidence photo'}
        className={`${className} object-cover group-hover:scale-105 transition-transform duration-200`}
      />
      {caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-left">
          <p className="text-white text-[11px] font-medium truncate">{caption}</p>
        </div>
      )}
    </div>
  );
}

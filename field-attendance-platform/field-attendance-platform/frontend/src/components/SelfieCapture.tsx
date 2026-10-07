import { useEffect, useState } from 'react';

/** Uses the device camera on mobile (capture="user"); falls back to a normal file picker elsewhere. */
export default function SelfieCapture({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div className="space-y-2">
      {url && <img src={url} alt="Selfie preview" className="h-48 w-48 rounded-xl object-cover" />}
      <input
        type="file" accept="image/jpeg,image/png,image/webp" capture="user"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block text-sm"
      />
    </div>
  );
}

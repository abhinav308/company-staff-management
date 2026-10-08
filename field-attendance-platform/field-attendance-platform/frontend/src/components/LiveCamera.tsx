import { useEffect, useRef, useState, ReactNode } from 'react';

export default function LiveCamera({ 
  onCapture, 
  buttonLabel = "Punch In", 
  color = "bg-[#00c696]",
  children 
}: { 
  onCapture: (file: File) => void, 
  buttonLabel?: string, 
  color?: string,
  children?: ReactNode
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
        }
      } catch (err) {
        setError('Camera access denied or unavailable.');
      }
    }
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
            onCapture(file);
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  return (
    <div className="absolute inset-0 bg-black flex flex-col justify-end overflow-hidden">
      {/* Video Stream */}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-white p-4 text-center z-0">
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover z-0"
          playsInline
          muted
          autoPlay
        />
      )}

      {/* Perfect Circular Overlay Mask using box-shadow */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
        <div className="w-72 h-72 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] mt-[-15%]" />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Footer controls overlay */}
      <div className="relative z-20 w-full px-6 pb-6 pt-16 flex flex-col justify-end bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none">
        <div className="w-full flex flex-col items-center gap-4 pointer-events-auto">
          {children}
          <button
            type="button"
            onClick={capture}
            className={`w-full ${color} text-white font-bold py-4 rounded shadow-lg text-lg uppercase tracking-wider`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

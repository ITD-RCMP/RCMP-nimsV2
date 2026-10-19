import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { CameraOff, ImageUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function ScanFrame({ detected }: { detected: boolean }) {
  const corner = cn(
    'absolute h-7 w-7 border-[3px] transition-colors duration-200',
    detected ? 'border-emerald-400' : 'border-white',
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative aspect-[3/2] w-[78%] max-w-xs">
        <div className={cn(corner, 'left-0 top-0 rounded-tl-md border-b-0 border-r-0')} />
        <div className={cn(corner, 'right-0 top-0 rounded-tr-md border-b-0 border-l-0')} />
        <div className={cn(corner, 'bottom-0 left-0 rounded-bl-md border-r-0 border-t-0')} />
        <div className={cn(corner, 'bottom-0 right-0 rounded-br-md border-l-0 border-t-0')} />
        {!detected && (
          <div className="animate-scan-line absolute inset-x-1 h-0.5 bg-emerald-400/90 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]" />
        )}
      </div>
    </div>
  );
}

export function AssetBarcodeScanner({
  active,
  onDetected,
}: {
  active: boolean;
  onDetected: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    setDetected(false);
    setUploadError(null);

    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result && !cancelled) {
          setDetected(true);
          onDetectedRef.current(result.getText());
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Camera access failed');
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    const url = URL.createObjectURL(file);
    try {
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      setDetected(true);
      onDetectedRef.current(result.getText());
    } catch {
      setUploadError('No barcode found in that image. Try a clearer photo.');
    } finally {
      URL.revokeObjectURL(url);
      setUploading(false);
    }
  };

  if (!active) return null;

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-[10px] border border-border bg-black">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <CameraOff className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <ScanFrame detected={detected} />
            <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-medium text-white/90 drop-shadow">
              {detected ? 'Barcode found — opening asset…' : 'Align the barcode within the frame'}
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
        {uploading ? 'Scanning image…' : 'Upload barcode image'}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      {uploadError && <p className="text-[11px] text-destructive">{uploadError}</p>}
    </div>
  );
}

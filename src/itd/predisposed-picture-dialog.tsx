import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImageUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { AssetKind } from '@shared/lib/inventory-schema';
import { type PredisposedPictureSlot, type PreDisposedAsset } from '@shared/lib/disposal-schema';
import {
  fileToJpegBase64,
  lastVideoDeviceId,
  listVideoInputs,
  setLastVideoDeviceId,
  snapshotToBlob,
  videoConstraints,
} from '@/lib/capture-image';
import { uploadPredisposedPictureFn } from '@backend/server/assets/assets.functions';
import { cn } from '@/lib/utils';

type Step = 'whole' | 'serial' | 'review';

type Draft = {
  preview: string;
  blob: Blob | null;
};

const STEPS: { id: Step; label: string }[] = [
  { id: 'whole', label: 'Whole asset' },
  { id: 'serial', label: 'Serial number' },
  { id: 'review', label: 'Review' },
];

const SLOT_COPY: Record<
  Exclude<Step, 'review'>,
  { slot: PredisposedPictureSlot; title: string; hint: string }
> = {
  whole: { slot: 'whole', title: 'Whole asset', hint: 'Fill the frame with the device' },
  serial: { slot: 'serial', title: 'Serial number', hint: 'Get close to the serial label' },
};

function revokeIfBlobUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function PredisposedPictureDialog({
  asset,
  open,
  onOpenChange,
  onPicturesChange,
}: {
  asset: PreDisposedAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicturesChange: (
    asset: PreDisposedAsset,
    pictures: Pick<PreDisposedAsset, 'imageWholeAsset' | 'imageSerialNumber'>,
  ) => void;
}) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [step, setStep] = useState<Step>('whole');
  const [whole, setWhole] = useState<Draft | null>(null);
  const [serial, setSerial] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const live = (step === 'whole' && !whole) || (step === 'serial' && !serial);

  useEffect(() => {
    if (!open) return;
    setWhole(asset?.imageWholeAsset ? { preview: asset.imageWholeAsset, blob: null } : null);
    setSerial(asset?.imageSerialNumber ? { preview: asset.imageSerialNumber, blob: null } : null);
    if (!asset?.imageWholeAsset) setStep('whole');
    else if (!asset.imageSerialNumber) setStep('serial');
    else setStep('review');
    setDeviceId(lastVideoDeviceId);
  }, [open, asset]);

  useEffect(() => {
    if (!open || !live) {
      setCameras([]);
      setCameraReady(false);
      return;
    }
    if (!videoEl) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('This browser cannot open the camera. You can still upload photos.');
      return;
    }

    let cancelled = false;
    const streamHolder: { current: MediaStream | null } = { current: null };
    setCameraReady(false);
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: videoConstraints(deviceId) })
      .then(async (nextStream) => {
        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamHolder.current = nextStream;
        videoEl.srcObject = nextStream;
        await videoEl.play();
        if (cancelled) return;
        setCameraReady(true);
        const list = await listVideoInputs();
        if (cancelled) return;
        setCameras(list);
        const activeId = nextStream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
        if (activeId && list.some((cam) => cam.deviceId === activeId) && deviceId !== activeId) {
          setLastVideoDeviceId(activeId);
          setDeviceId(activeId);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (deviceId) {
          setLastVideoDeviceId('');
          setDeviceId('');
          toast.error('That camera is unavailable. Switching to another camera.');
          return;
        }
        toast.error('Allow camera access when the browser asks, then try again. You can still upload photos.');
      });

    return () => {
      cancelled = true;
      setCameraReady(false);
      streamHolder.current?.getTracks().forEach((track) => track.stop());
      videoEl.srcObject = null;
    };
  }, [open, live, videoEl, deviceId]);

  useEffect(() => {
    if (!open) {
      setWhole((prev) => {
        revokeIfBlobUrl(prev?.preview);
        return null;
      });
      setSerial((prev) => {
        revokeIfBlobUrl(prev?.preview);
        return null;
      });
    }
  }, [open]);

  const setDraft = (slot: PredisposedPictureSlot, blob: Blob) => {
    const preview = URL.createObjectURL(blob);
    const draft: Draft = { preview, blob };
    if (slot === 'whole') {
      setWhole((prev) => {
        revokeIfBlobUrl(prev?.preview);
        return draft;
      });
    } else {
      setSerial((prev) => {
        revokeIfBlobUrl(prev?.preview);
        return draft;
      });
    }
  };

  const clearDraft = (slot: PredisposedPictureSlot) => {
    if (slot === 'whole') {
      setWhole((prev) => {
        revokeIfBlobUrl(prev?.preview);
        return null;
      });
    } else {
      setSerial((prev) => {
        revokeIfBlobUrl(prev?.preview);
        return null;
      });
    }
  };

  const handleSnap = async () => {
    const video = videoEl;
    if (!video || !cameraReady || step === 'review') {
      toast.error('Wait for the camera, or upload a photo instead.');
      return;
    }
    try {
      const blob = await snapshotToBlob(video);
      setDraft(step, blob);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not capture this photo');
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || step === 'review') return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a photo file.');
      return;
    }
    setDraft(step, file);
  };

  const goNext = () => {
    if (step === 'whole' && whole) setStep('serial');
    else if (step === 'serial' && serial) setStep('review');
  };

  const goBack = () => {
    if (step === 'serial') setStep('whole');
    else if (step === 'review') setStep('serial');
  };

  const handleSave = async () => {
    if (!asset || !whole || !serial) return;
    setSaving(true);
    try {
      const upload = async (slot: PredisposedPictureSlot, draft: Draft) => {
        if (!draft.blob) return draft.preview.split('?')[0];
        const dataBase64 = await fileToJpegBase64(draft.blob);
        const result = await uploadPredisposedPictureFn({
          data: {
            mimeType: 'image/jpeg',
            dataBase64,
            kind: asset.kind as AssetKind,
            assetId: asset.assetId,
            slot,
          },
        });
        return `${result.url}?t=${Date.now()}`;
      };
      const imageWholeAsset = await upload('whole', whole);
      const imageSerialNumber = await upload('serial', serial);
      onPicturesChange(asset, { imageWholeAsset, imageSerialNumber });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save these photos');
    } finally {
      setSaving(false);
    }
  };

  const copy = step === 'review' ? null : SLOT_COPY[step];
  const currentDraft = step === 'whole' ? whole : step === 'serial' ? serial : null;

  return (
    <Dialog open={open && asset != null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto rounded-[14px] sm:max-w-4xl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {step === 'review' ? 'Review pictures' : copy?.title}
          </DialogTitle>
          <DialogDescription>
            {step === 'review'
              ? `Check both photos for ${asset?.assetId} before saving.`
              : `${copy?.hint}. Snap or upload, then continue.`}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {STEPS.map((item, index) => (
            <li key={item.id} className="flex min-w-0 items-center gap-2">
              {index > 0 ? <span aria-hidden>→</span> : null}
              <span className={cn(step === item.id && 'text-foreground')}>{item.label}</span>
            </li>
          ))}
        </ol>

        {step === 'review' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReviewCard
              title="Whole asset"
              preview={whole?.preview ?? null}
              onRetake={() => {
                setStep('whole');
                clearDraft('whole');
              }}
            />
            <ReviewCard
              title="Serial number"
              preview={serial?.preview ?? null}
              onRetake={() => {
                setStep('serial');
                clearDraft('serial');
              }}
            />
          </div>
        ) : (
          <div className="rounded-[12px] border border-border bg-card p-3 shadow-sm">
            <div className="mb-2">
              <p className="text-sm font-semibold text-foreground">{copy?.title}</p>
              <p className="text-[11px] text-muted-foreground">{copy?.hint}</p>
            </div>
            {cameras.length > 1 && live ? (
              <div className="mb-2 space-y-1.5">
                <Label htmlFor="predisposed-camera" className="text-sm">
                  Camera
                </Label>
                <select
                  id="predisposed-camera"
                  className="flex h-9 w-full rounded-[8px] border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={deviceId}
                  onChange={(event) => {
                    setLastVideoDeviceId(event.target.value);
                    setDeviceId(event.target.value);
                  }}
                >
                  {cameras.map((cam, index) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[8px] border border-border bg-black">
              {live ? (
                <video
                  ref={setVideoEl}
                  className="aspect-video w-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              ) : currentDraft ? (
                <img
                  src={currentDraft.preview}
                  alt={copy?.title}
                  className="aspect-video w-full object-cover"
                />
              ) : null}
            </div>
            <div className="mt-2 flex gap-2">
              {live ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 flex-1 gap-1.5 rounded-[8px] active:scale-[0.97]"
                    disabled={!cameraReady}
                    onClick={() => void handleSnap()}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Snap
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1.5 rounded-[8px] active:scale-[0.97]"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImageUp className="h-3.5 w-3.5" />
                    Upload
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full rounded-[8px] active:scale-[0.97]"
                  onClick={() => copy && clearDraft(copy.slot)}
                >
                  Retake
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleFiles(event)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-[8px]"
            disabled={step === 'whole' || saving}
            onClick={goBack}
          >
            Back
          </Button>
          {step === 'review' ? (
            <Button
              type="button"
              className="rounded-[8px] gap-1.5"
              disabled={!whole || !serial || saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-[8px]"
              disabled={!currentDraft}
              onClick={goNext}
            >
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewCard({
  title,
  preview,
  onRetake,
}: {
  title: string;
  preview: string | null;
  onRetake: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-3 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
      {preview ? (
        <img src={preview} alt={title} className="h-36 w-full rounded-[8px] object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center rounded-[8px] border border-dashed border-border text-xs text-muted-foreground">
          Missing
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-8 w-full rounded-[8px] active:scale-[0.97]"
        onClick={onRetake}
      >
        Retake
      </Button>
    </div>
  );
}

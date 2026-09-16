import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  receiptPath: string | null;
};

export function ReceiptIndicator({ receiptPath }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setSignedUrl(null);
    setFailed(false);
    setPreviewOpen(false);

    if (!receiptPath) return () => { active = false; };

    supabase.storage
      .from("receipts")
      .createSignedUrl(receiptPath, 3600)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          setFailed(true);
          return;
        }
        setSignedUrl(data.signedUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [receiptPath]);

  if (!receiptPath) return null;

  const className =
    "mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors";
  const content = (
    <>
      <Paperclip className="h-3 w-3" />
      <span>Receipt attached</span>
    </>
  );

  if (!signedUrl) {
    return (
      <span
        className={`${className} cursor-default opacity-70`}
        title={failed ? "Unable to open receipt right now" : "Preparing receipt preview"}
        aria-disabled="true"
      >
        {content}
      </span>
    );
  }

  const isPdf = receiptPath.toLowerCase().split("?")[0].endsWith(".pdf");

  return (
    <>
      <button
        type="button"
        className={`${className} cursor-pointer hover:bg-primary/10 hover:underline`}
        onClick={(event) => {
          event.stopPropagation();
          setPreviewOpen(true);
        }}
        aria-label="Preview attached receipt"
        aria-haspopup="dialog"
      >
        {content}
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="h-[85vh] w-[calc(100vw-2rem)] max-w-4xl overflow-hidden p-0"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle className="text-base">Receipt preview</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3">
            {isPdf ? (
              <iframe
                src={signedUrl}
                title="Attached receipt PDF"
                className="h-full min-h-[70vh] w-full rounded-md border bg-background"
              />
            ) : (
              <div className="flex h-full min-h-[70vh] items-center justify-center">
                <img
                  src={signedUrl}
                  alt="Attached receipt"
                  className="max-h-[70vh] max-w-full rounded-md object-contain"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

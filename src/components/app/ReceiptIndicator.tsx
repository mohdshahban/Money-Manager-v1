import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  receiptPath: string | null;
};

export function ReceiptIndicator({ receiptPath }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSignedUrl(null);
    setFailed(false);

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
        title={failed ? "Unable to open receipt right now" : "Preparing receipt link"}
        aria-disabled="true"
      >
        {content}
      </span>
    );
  }

  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noreferrer"
      className={`${className} hover:bg-primary/10 hover:underline`}
      onClick={(event) => event.stopPropagation()}
      aria-label="Open attached receipt"
    >
      {content}
    </a>
  );
}

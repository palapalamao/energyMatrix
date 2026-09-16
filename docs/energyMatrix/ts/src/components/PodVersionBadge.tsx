import { useEffect, useState } from "react";
import { useClient } from "haystack-react";
import { emInfo, str } from "@/api/emApi";

export function PodVersionBadge() {
  const client = useClient();
  const [version, setVersion] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVersion(undefined);
    setError(undefined);

    emInfo(client)
      .then((info) => {
        if (!cancelled) setVersion(info ? str(info, "version") : undefined);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div
      className="shrink-0 border-t border-shell-line px-3 py-2 text-center text-[10px] tracking-wide text-slate-500"
      title={error}
    >
      {loading ? "…" : version ?? "?"}
    </div>
  );
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiGetDocPreview, API_BASE } from "../lib/api";

type DocInfo = { fileId: string; filename: string };

type DocumentPreviewContextValue = {
  openPreview: (info: DocInfo) => void;
  closePreview: () => void;
};

type PreviewState = {
  mediaType: string;
  iframeUrl?: string;
  html?: string;
  downloadUrl?: string;
  summaryHtml?: string;
};

const DocumentPreviewContext = createContext<DocumentPreviewContextValue | undefined>(
  undefined
);

export function DocumentPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const closePreview = useCallback(() => {
    setDoc(null);
    setLoading(false);
    setError(null);
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPreview(null);
      try {
        const result = await apiGetDocPreview(doc.fileId);
        if (cancelled) return;
        if (result.mediaType.includes("html") && result.html) {
          setPreview({ mediaType: result.mediaType, html: result.html });
        } else if (result.url) {
          const iframeUrl = result.url.startsWith("http")
            ? result.url
            : `${API_BASE}${result.url}`;
          setPreview({
            mediaType: result.mediaType,
            iframeUrl,
            downloadUrl: iframeUrl,
            summaryHtml: result.summaryHtml,
          });
        } else {
          setError("Geen voorvertoning beschikbaar");
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Kan document niet laden");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doc, closePreview]);

  const openPreview = useCallback((info: DocInfo) => {
    setDoc(info);
  }, []);

  const value = useMemo(
    () => ({
      openPreview,
      closePreview,
    }),
    [openPreview, closePreview]
  );

  const hasHtml = !!preview?.html;
  const isEmbeddable =
    !!preview?.iframeUrl &&
    (preview.mediaType.startsWith("application/pdf") || preview.mediaType.startsWith("image/"));

  return (
    <DocumentPreviewContext.Provider value={value}>
      {children}
      {doc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closePreview} />
          <div className="relative z-10 mx-4 w-full max-w-5xl overflow-hidden rounded-2xl border theme-border theme-surface shadow-xl">
            <div className="flex items-center justify-between border-b theme-border px-5 py-3">
              <div className="truncate text-sm font-medium" title={doc.filename}>
                {doc.filename}
              </div>
              <div className="flex items-center gap-2">
                {preview?.downloadUrl && (
                  <a
                    href={preview.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border theme-border theme-surface px-3 py-1 text-sm"
                  >
                    Download origineel
                  </a>
                )}
                <button
                  onClick={closePreview}
                  className="rounded-md border theme-border theme-surface px-2 py-1 text-sm"
                  aria-label="Sluiten"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto theme-soft">
              {loading ? (
                <div className="p-6 text-center text-sm theme-muted">Bezig met laden…</div>
              ) : error ? (
                <div className="p-6 text-sm text-red-600">{error}</div>
              ) : hasHtml ? (
                <div
                  className="prose max-w-none px-6 py-4"
                  dangerouslySetInnerHTML={{ __html: preview?.html || "" }}
                />
              ) : preview?.iframeUrl ? (
                isEmbeddable ? (
                  <iframe
                    title={doc.filename}
                    src={preview.iframeUrl}
                    className="h-[75vh] w-full"
                  />
                ) : (
                  <div className="space-y-4 px-6 py-4 text-sm">
                    <p className="theme-muted">
                      Download het originele bestand via de knop hierboven om de bron te bekijken.
                    </p>
                    {preview?.summaryHtml && (
                      <div
                        className="prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: preview.summaryHtml }}
                      />
                    )}
                  </div>
                )
              ) : (
                <div className="p-6 text-sm theme-muted">Geen voorvertoning beschikbaar.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </DocumentPreviewContext.Provider>
  );
}

export function useDocumentPreview() {
  const ctx = useContext(DocumentPreviewContext);
  if (!ctx) {
    throw new Error("useDocumentPreview moet binnen DocumentPreviewProvider gebruikt worden");
  }
  return ctx;
}

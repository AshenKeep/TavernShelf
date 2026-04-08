import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/* ── PDF Viewer ──────────────────────────────────────────── */
function PdfViewer({ url, token }) {
  const containerRef = useRef(null);
  const [pdfjsLib, setPdfjsLib]     = useState(null);
  const [pdf, setPdf]               = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [rendering, setRendering]   = useState(false);
  const [scale, setScale]           = useState(1.4);
  const canvasRef = useRef(null);
  const renderTask = useRef(null);

  useEffect(() => {
    import('pdfjs-dist').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      setPdfjsLib(lib);
    });
  }, []);

  useEffect(() => {
    if (!pdfjsLib || !url) return;
    pdfjsLib.getDocument({ url, httpHeaders: { Authorization: `Bearer ${token}` } })
      .promise.then(doc => { setPdf(doc); setTotalPages(doc.numPages); setCurrentPage(1); });
  }, [pdfjsLib, url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    if (renderTask.current) { renderTask.current.cancel(); }

    setRendering(true);
    pdf.getPage(currentPage).then(page => {
      const viewport = page.getViewport({ scale });
      const canvas   = canvasRef.current;
      canvas.height  = viewport.height;
      canvas.width   = viewport.width;
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      renderTask.current = task;
      task.promise.then(() => setRendering(false)).catch(() => {});
    });
  }, [pdf, currentPage, scale]);

  const goTo = (n) => setCurrentPage(Math.max(1, Math.min(totalPages, n)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>
          <Icon d="M15 18l-6-6 6-6" size={14} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>
          <input type="number" value={currentPage} min={1} max={totalPages}
            onChange={e => goTo(parseInt(e.target.value))}
            style={{ width: 48, textAlign: 'center', padding: '4px 6px' }} />
          {' / '}{totalPages}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages}>
          <Icon d="M9 18l6-6-6-6" size={14} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Zoom</span>
        <input type="range" min={0.5} max={3} step={0.1} value={scale}
          onChange={e => setScale(parseFloat(e.target.value))}
          style={{ width: 80 }} />
        <span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 36 }}>{Math.round(scale * 100)}%</span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 24, background: 'var(--bg-0)' }}>
        {rendering && !pdf && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}><div className="spinner" /> Loading PDF…</div>}
        <canvas ref={canvasRef} style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.6)', maxWidth: '100%' }} />
      </div>
    </div>
  );
}

/* ── Image Viewer ────────────────────────────────────────── */
function ImageViewer({ url, token }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, background: 'var(--bg-0)' }}>
      <img src={`${url}?t=${Date.now()}`} alt="File"
        style={{ maxWidth: '100%', boxShadow: '0 4px 32px rgba(0,0,0,0.6)' }}
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

/* ── CBZ Viewer ──────────────────────────────────────────── */
function CbzViewer({ url, token }) {
  const [pages, setPages]       = useState([]);
  const [current, setCurrent]   = useState(0);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    // Fetch the CBZ and extract image blobs client-side via jszip
    import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js').then(async () => {
      const JSZip = window.JSZip;
      setLoading(true);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const buf = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const entries = Object.keys(zip.files)
        .filter(n => /\.(jpg|jpeg|png|webp|gif)$/i.test(n) && !zip.files[n].dir)
        .sort();
      const blobs = await Promise.all(entries.map(async name => {
        const data = await zip.files[name].async('blob');
        return URL.createObjectURL(data);
      }));
      setPages(blobs);
      setLoading(false);
    });
  }, [url]);

  const go = (n) => setCurrent(Math.max(0, Math.min(pages.length - 1, n)));

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><div className="spinner" /> Loading comic…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => go(current - 1)} disabled={current === 0}>
          <Icon d="M15 18l-6-6 6-6" size={14} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{current + 1} / {pages.length}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => go(current + 1)} disabled={current >= pages.length - 1}>
          <Icon d="M9 18l6-6-6-6" size={14} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 24, background: 'var(--bg-0)' }}>
        {pages[current] && <img src={pages[current]} alt={`Page ${current + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 32px rgba(0,0,0,0.6)' }} />}
      </div>
    </div>
  );
}

/* ── Reader shell ────────────────────────────────────────── */
export default function ReaderPage() {
  const { id }          = useParams();
  const navigate        = useNavigate();
  const { get, streamUrl, token } = useApi();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get(`/library/items/${id}`).then(setItem).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;
  if (!item) return null;

  const url = streamUrl(item.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-0)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 50, background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0, minWidth: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <Icon d="M19 12H5M12 5l-7 7 7 7" size={14} />
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
        <span className="badge badge-gray" style={{ marginLeft: 'auto', flexShrink: 0 }}>{item.file_type.toUpperCase()}</span>
      </div>

      {/* Viewer */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {item.file_type === 'pdf'   && <PdfViewer   url={url} token={token} />}
        {item.file_type === 'image' && <ImageViewer url={url} token={token} />}
        {item.file_type === 'cbz'   && <CbzViewer   url={url} token={token} />}
      </div>
    </div>
  );
}

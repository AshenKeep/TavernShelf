import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/* ── PDF Viewer ──────────────────────────────────────────── */
function PdfViewer({ url, token, itemId }) {
  const containerRef  = useRef(null);
  const canvasRef     = useRef(null);
  const renderTask    = useRef(null);
  const scrollTimeout = useRef(null);

  const [pdfjsLib, setPdfjsLib] = useState(null);
  const [pdf, setPdf]           = useState(null);
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = localStorage.getItem(`ts_page_${itemId}`);
    return saved ? parseInt(saved) : 1;
  });
  const [totalPages, setTotalPages] = useState(0);
  const [rendering, setRendering]   = useState(false);
  const [scale, setScale]           = useState(() => {
    const saved = localStorage.getItem(`ts_zoom_${itemId}`);
    return saved ? parseFloat(saved) : 1.4;
  });
  const [jumpInput, setJumpInput]   = useState('');
  const [scrollMode, setScrollMode] = useState(false);
  const [scrollPages, setScrollPages] = useState([]); // for scroll mode

  // Load PDF.js
  useEffect(() => {
    import('pdfjs-dist').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      setPdfjsLib(lib);
    });
  }, []);

  // Load PDF document
  useEffect(() => {
    if (!pdfjsLib || !url) return;
    pdfjsLib.getDocument({ url, httpHeaders: { Authorization: `Bearer ${token}` } })
      .promise.then(doc => {
        setPdf(doc);
        setTotalPages(doc.numPages);
        // Clamp saved page to valid range
        setCurrentPage(p => Math.min(p, doc.numPages));
      });
  }, [pdfjsLib, url]);

  // Save page to localStorage whenever it changes
  useEffect(() => {
    if (currentPage > 0) localStorage.setItem(`ts_page_${itemId}`, currentPage);
  }, [currentPage, itemId]);

  // Save zoom to localStorage
  useEffect(() => {
    localStorage.setItem(`ts_zoom_${itemId}`, scale);
  }, [scale, itemId]);

  // Render single page (paginated mode)
  useEffect(() => {
    if (scrollMode || !pdf || !canvasRef.current) return;
    if (renderTask.current) { renderTask.current.cancel(); }
    setRendering(true);
    pdf.getPage(currentPage).then(page => {
      const viewport = page.getViewport({ scale });
      const canvas   = canvasRef.current;
      if (!canvas) return;
      canvas.height  = viewport.height;
      canvas.width   = viewport.width;
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      renderTask.current = task;
      task.promise.then(() => setRendering(false)).catch(() => setRendering(false));
    }).catch(() => setRendering(false));
  }, [pdf, currentPage, scale, scrollMode]);

  // Render all pages (scroll mode)
  useEffect(() => {
    if (!scrollMode || !pdf) return;
    const load = async () => {
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        pages.push(i);
      }
      setScrollPages(pages);
    };
    load();
  }, [scrollMode, pdf]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(currentPage + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goTo(currentPage - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, totalPages]);

  const goTo = useCallback((n) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, n)));
  }, [totalPages]);

  const handleJump = (e) => {
    e.preventDefault();
    const n = parseInt(jumpInput);
    if (!isNaN(n)) { goTo(n); setJumpInput(''); }
  };

  const zoomIn  = () => setScale(s => Math.min(3, parseFloat((s + 0.2).toFixed(1))));
  const zoomOut = () => setScale(s => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Page nav */}
        <button className="btn btn-ghost btn-sm" onClick={() => goTo(1)} disabled={currentPage <= 1} title="First page">
          <Icon d="M19 12H5M12 5l-7 7 7 7" size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} title="Previous page">
          <Icon d="M15 18l-6-6 6-6" size={13} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" value={currentPage} min={1} max={totalPages}
            onChange={e => goTo(parseInt(e.target.value) || 1)}
            style={{ width: 44, textAlign: 'center', padding: '3px 4px', fontSize: 12 }} />
          <span style={{ color: 'var(--text-3)' }}>/ {totalPages}</span>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} title="Next page">
          <Icon d="M9 18l6-6-6-6" size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => goTo(totalPages)} disabled={currentPage >= totalPages} title="Last page">
          <Icon d="M5 12h14M12 5l7 7-7 7" size={13} />
        </button>

        {/* Jump to page */}
        <form onSubmit={handleJump} style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
          <input
            type="number" placeholder="Go to…" value={jumpInput}
            onChange={e => setJumpInput(e.target.value)}
            style={{ width: 64, padding: '3px 6px', fontSize: 12 }}
            min={1} max={totalPages}
          />
          <button type="submit" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Go</button>
        </form>

        <div style={{ flex: 1 }} />

        {/* Scroll mode toggle */}
        <button className={`btn btn-sm ${scrollMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setScrollMode(m => !m)}
          title={scrollMode ? 'Switch to page mode' : 'Switch to scroll mode'}
          style={{ fontSize: 11 }}>
          {scrollMode ? '⊟ Page' : '⊞ Scroll'}
        </button>

        {/* Zoom */}
        <button className="btn btn-ghost btn-sm" onClick={zoomOut} title="Zoom out">−</button>
        <span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button className="btn btn-ghost btn-sm" onClick={zoomIn} title="Zoom in">+</button>
        <input type="range" min={0.5} max={3} step={0.1} value={scale}
          onChange={e => setScale(parseFloat(e.target.value))}
          style={{ width: 70 }} />

        {rendering && !scrollMode && <div className="spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />}
      </div>

      {/* Paginated canvas */}
      {!scrollMode && (
        <div ref={containerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 24, background: 'var(--bg-0)' }}>
          {!pdf && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', alignSelf: 'center' }}><div className="spinner" /> Loading PDF…</div>}
          <canvas ref={canvasRef} style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.6)', maxWidth: '100%', alignSelf: 'flex-start' }} />
        </div>
      )}

      {/* Scroll mode — all pages stacked */}
      {scrollMode && pdf && (
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-0)', padding: '16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {scrollPages.map(pageNum => (
            <ScrollPage key={pageNum} pdf={pdf} pageNum={pageNum} scale={scale} />
          ))}
        </div>
      )}
    </div>
  );
}

// Individual page rendered in scroll mode
function ScrollPage({ pdf, pageNum, scale }) {
  const canvasRef   = useRef(null);
  const [ready, setReady] = useState(false);
  const observer = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use IntersectionObserver to lazy-render pages only when visible
    observer.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !ready) {
        setReady(true);
        observer.current?.disconnect();
      }
    }, { rootMargin: '400px' });
    observer.current.observe(canvas);
    return () => observer.current?.disconnect();
  }, []);

  useEffect(() => {
    if (!ready) return;
    pdf.getPage(pageNum).then(page => {
      const viewport = page.getViewport({ scale });
      const canvas   = canvasRef.current;
      if (!canvas) return;
      canvas.height  = viewport.height;
      canvas.width   = viewport.width;
      page.render({ canvasContext: canvas.getContext('2d'), viewport });
    });
  }, [ready, pageNum, scale, pdf]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef}
        style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.6)', maxWidth: '100%', display: 'block',
          minHeight: ready ? undefined : 800, background: 'var(--bg-2)' }} />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      )}
    </div>
  );
}

/* ── Image Viewer ────────────────────────────────────────── */
function ImageViewer({ url }) {
  const containerRef = useRef(null);
  const imgRef       = useRef(null);
  const [zoom, setZoom]         = useState(1);
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  // Fit image to container on load
  const fitToContainer = useCallback(() => {
    if (!containerRef.current || !imgRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    const { naturalWidth: iw, naturalHeight: ih } = imgRef.current;
    if (!iw || !ih) return;
    setNaturalSize({ w: iw, h: ih });
    const fit = Math.min(cw / iw, ch / ih, 1);
    setZoom(fit);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => { if (loaded) fitToContainer(); }, [loaded, fitToContainer]);

  // Wheel zoom
  const onWheel = useCallback(e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.max(0.1, Math.min(8, z * factor)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Drag to pan
  const onMouseDown = e => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = e => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => setDragging(false);

  // Touch pinch-to-zoom + drag
  const lastTouchDist = useRef(null);
  const onTouchStart = e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      setDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };
  const onTouchMove = e => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / lastTouchDist.current;
      lastTouchDist.current = dist;
      setZoom(z => Math.max(0.1, Math.min(8, z * factor)));
    } else if (e.touches.length === 1 && dragging) {
      setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
    }
  };
  const onTouchEnd = () => { setDragging(false); lastTouchDist.current = null; };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const zoomIn  = () => setZoom(z => Math.min(8, z * 1.25));
  const zoomOut = () => setZoom(z => Math.max(0.1, z / 1.25));
  const reset   = () => fitToContainer();
  const actual  = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={zoomOut} title="Zoom out">−</button>
        <span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-ghost btn-sm" onClick={zoomIn} title="Zoom in">+</button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button className="btn btn-ghost btn-sm" onClick={reset} title="Fit to window">⊡ Fit</button>
        <button className="btn btn-ghost btn-sm" onClick={actual} title="Actual size">1:1</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {naturalSize.w > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{naturalSize.w} × {naturalSize.h}px</span>}
          <button className="btn btn-ghost btn-sm" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? '⊠' : '⛶'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onDoubleClick={reset}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        {!loaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        )}
        <img ref={imgRef} src={url} alt="File"
          onLoad={() => setLoaded(true)}
          onError={e => { e.target.alt = 'Failed to load image'; }}
          draggable={false}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.05s',
            maxWidth: 'none',
            boxShadow: '0 4px 40px rgba(0,0,0,0.7)',
            display: loaded ? 'block' : 'none',
          }}
        />
      </div>

      {/* Keyboard hint */}
      <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', padding: '4px 0', background: 'var(--bg-1)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        Scroll to zoom · Drag to pan · Double-click to reset
      </div>
    </div>
  );
}

/* ── CBZ Viewer ──────────────────────────────────────────── */
function CbzViewer({ url, token }) {
  const [pages, setPages]     = useState([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 50, background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0, minWidth: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <Icon d="M19 12H5M12 5l-7 7 7 7" size={14} />
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
        <span className="badge badge-gray" style={{ marginLeft: 'auto', flexShrink: 0 }}>{item.file_type.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {item.file_type === 'pdf'   && <PdfViewer   url={url} token={token} itemId={id} />}
        {item.file_type === 'image' && <ImageViewer url={url} token={token} />}
        {item.file_type === 'cbz'   && <CbzViewer   url={url} token={token} />}
      </div>
    </div>
  );
}

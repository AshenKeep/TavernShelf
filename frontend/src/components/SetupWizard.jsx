import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';

export default function SetupWizard({ onComplete }) {
  const { put, post } = useApi();
  const [step, setStep]       = useState(1);
  const [choice, setChoice]   = useState(null); // 'yes' | 'no'
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);
  const [result, setResult]   = useState(null);

  const handleChoice = async (answer) => {
    setChoice(answer);
    setStep(2);

    if (answer === 'no') {
      // Save settings and dismiss
      await put('/admin/settings', {
        'library.auto_organise': 'false',
        'library.setup_complete': 'true',
      });
      onComplete();
      return;
    }

    // Yes — save setting and trigger organise
    setRunning(true);
    await put('/admin/settings', {
      'library.auto_organise': 'true',
      'library.setup_complete': 'true',
    });

    try {
      const r = await post('/library/organise-all', {});
      setResult(r);
    } catch (e) {
      setResult({ error: e.message });
    }
    setRunning(false);
    setDone(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 520, padding: 36 }}>

        {/* Logo */}
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--amber-hi)', marginBottom: 4 }}>
          TavernShelf
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>
          Library Setup
        </div>

        {step === 1 && (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-0)', marginBottom: 12 }}>
              Organise your library automatically?
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
              TavernShelf can organise your files into a structured folder layout based on their metadata:
            </p>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 20, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.8 }}>
              <div style={{ color: 'var(--amber-hi)' }}>D&amp;D 5e /</div>
              <div style={{ paddingLeft: 16 }}>Core Rulebook /</div>
              <div style={{ paddingLeft: 32, color: 'var(--text-3)' }}>Players Handbook.pdf</div>
              <div style={{ paddingLeft: 16 }}>Adventure Module /</div>
              <div style={{ paddingLeft: 32 }}>Curse of Strahd /</div>
              <div style={{ paddingLeft: 48, color: 'var(--text-3)' }}>Core Files, Maps…</div>
              <div style={{ color: 'var(--amber-hi)' }}>Pathfinder 2e /</div>
              <div style={{ paddingLeft: 16 }}>Core Rulebook /</div>
              <div style={{ paddingLeft: 16, color: 'var(--text-3)' }}>…</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.6 }}>
              Files without a system or content type will go to <strong style={{ color: 'var(--text-2)' }}>Unsorted</strong> for your review.
              You can change this setting any time in Admin → Organisation.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleChoice('yes')}>
                Yes — organise my library
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleChoice('no')}>
                No — I'll manage it myself
              </button>
            </div>
          </>
        )}

        {step === 2 && running && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, color: 'var(--text-0)', marginBottom: 8 }}>Organising your library…</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Files are being moved to their correct locations.</div>
          </div>
        )}

        {step === 2 && done && (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-0)', marginBottom: 16 }}>
              Setup complete
            </h2>
            {result?.error ? (
              <div style={{ fontSize: 13, color: 'var(--red-hi)', marginBottom: 20 }}>{result.error}</div>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.7 }}>
                Library organised. Files will continue to be organised automatically when you save metadata.
                {result?.needsModule?.length > 0 && (
                  <div style={{ marginTop: 10, color: 'var(--amber-hi)' }}>
                    {result.needsModule.length} adventure module{result.needsModule.length > 1 ? 's' : ''} need a folder name — check Admin → Organisation.
                  </div>
                )}
              </div>
            )}
            <button className="btn btn-primary" onClick={onComplete}>Enter TavernShelf</button>
          </>
        )}

      </div>
    </div>
  );
}

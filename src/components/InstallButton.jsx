import React, { useState, useSyncExternalStore } from 'react';
import { Download, X, Share, PlusSquare, MoreVertical, Smartphone } from 'lucide-react';
import { getInstallState, promptInstall, subscribe } from '../pwa/installPrompt';

// Snapshot must be stable between renders for useSyncExternalStore
let cached = null;
const getSnapshot = () => {
  const next = getInstallState();
  if (!cached || cached.installed !== next.installed || cached.canPrompt !== next.canPrompt || cached.ios !== next.ios) {
    cached = next;
  }
  return cached;
};

/**
 * Header "Install App" button.
 * - Chrome / Edge: opens the browser's real install dialog
 * - iPhone / iPad: shows Share -> Add to Home Screen steps (Safari has no install API)
 * - Other browsers: shows where to find "Install app" in the browser menu
 * - Hidden once the app is installed / opened from the home screen
 */
// variant 'button' = compact header button, 'card' = sidebar card from the dashboard design
export default function InstallButton({ variant = 'button' }) {
  const { installed, canPrompt, ios } = useSyncExternalStore(subscribe, getSnapshot);
  const [showHelp, setShowHelp] = useState(false);

  if (installed) return null;

  const handleClick = async () => {
    // iPhone/iPad browsers have no install API: always show the Add to Home Screen steps
    if (canPrompt && !ios) {
      const outcome = await promptInstall();
      if (outcome !== 'unavailable') return;
    }
    setShowHelp(true);
  };
  
  return (
    <>
      {variant === 'card' ? (
        <div className="install-card">
          <Smartphone size={26} className="install-card-icon" />
          <strong>Install App</strong>
          <span>Use it like a native app on your device.</span>
          <button type="button" className="btn-gradient install-card-btn" onClick={handleClick}>
            <Download size={16} />
            <span>Install</span>
          </button>
        </div>
      ) : (
        <button type="button" className="cellular-info-btn install-app-btn" onClick={handleClick} title="Install this app">
          <Download size={16} />
          <span className="info-btn-text">Install App</span>
        </button>
      )}

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal-card install-help-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-box">
                <Download className="modal-icon" size={22} />
                <div>
                  <h2 className="modal-title">Install the app</h2>
                  <p className="modal-subtitle">Get an icon on your home screen that opens full-screen</p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setShowHelp(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {ios ? (
                <ol className="install-steps">
                  <li>
                    Open this page in <strong>Safari</strong>.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> button <Share size={15} className="inline-icon" /> at the bottom of the screen.
                  </li>
                  <li>
                    Choose <strong>Add to Home Screen</strong> <PlusSquare size={15} className="inline-icon" />, then tap <strong>Add</strong>.
                  </li>
                  <li>Open the app from the new home-screen icon (needed for call notifications).</li>
                </ol>
              ) : (
                <ol className="install-steps">
                  <li>
                    Open the browser menu <MoreVertical size={15} className="inline-icon" /> (top-right in Chrome).
                  </li>
                  <li>
                    Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </li>
                  <li>
                    On a computer you can also click the install icon <Download size={15} className="inline-icon" /> at the right
                    end of the address bar.
                  </li>
                </ol>
              )}
              <p className="config-desc">
                If you don't see the option, make sure the page is opened over <strong>https</strong> (your live site) and
                reload once.
              </p>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowHelp(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

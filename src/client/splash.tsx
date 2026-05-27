import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
  return (
    <div className="app-shell">
      <header className="hero">
        <img className="brand-mark hero-logo" src="/logo.png" alt="AppealDesq logo" />
        <div>
          <p className="eyebrow">Reddit modmail appeal triage</p>
          <h1>AppealDesq</h1>
          <p>Structured ban appeals for busy mod teams</p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={(event) => requestExpandedMode(event.nativeEvent, 'default')}
        >
          Open dashboard
        </button>
      </header>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);

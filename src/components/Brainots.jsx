import { useEffect } from 'react';
import './Brainots.css';

let brainotContainer = null;

export const spawnBrainots = (count = 10, message = '') => {
  if (!brainotContainer) {
    brainotContainer = document.createElement('div');
    brainotContainer.className = 'brainots-container pointer-events-none fixed inset-0 z-50 overflow-hidden';
    document.body.appendChild(brainotContainer);
  }

  for (let i = 0; i < count; i++) {
    createBrainot(message && i === 0 ? message : null);
  }
};

const createBrainot = (message) => {
  const brainot = document.createElement('div');
  brainot.className = 'brainot absolute flex flex-col items-center gap-2';
  
  const icon = document.createElement('div');
  icon.innerText = '🧠';
  icon.className = 'text-3xl filter drop-shadow-lg';
  brainot.appendChild(icon);

  if (message) {
    const text = document.createElement('div');
    text.innerText = message;
    text.className = 'bg-purple-900/80 text-purple-100 text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap backdrop-blur-sm border border-purple-500/50';
    brainot.appendChild(text);
  }

  const startX = Math.random() * window.innerWidth;
  const startY = window.innerHeight + 50;

  brainot.style.left = `${startX}px`;
  brainot.style.top = `${startY}px`;

  const duration = 2500 + Math.random() * 2500; // 2.5s to 5s
  brainot.style.animation = `floatUp ${duration}ms ease-out forwards`;
  
  // Random horizontal drift with variation
  const drift = (Math.random() - 0.5) * 300;
  brainot.style.setProperty('--drift', `${drift}px`);

  brainotContainer.appendChild(brainot);

  setTimeout(() => {
    if (brainotContainer && brainotContainer.contains(brainot)) {
      brainotContainer.removeChild(brainot);
    }
  }, duration);
};

export default function Brainots() {
  useEffect(() => {
    return () => {
      if (brainotContainer) {
        document.body.removeChild(brainotContainer);
        brainotContainer = null;
      }
    };
  }, []);

  return null;
}

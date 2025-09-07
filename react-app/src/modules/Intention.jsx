import React from 'react';
import { t } from './i18n.js';

export function Intention({ value, onChange }) {
  return (
    <div className="h-12 flex items-center justify-center mb-4">
  <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={t('intentionPlaceholder')} className="w-full max-w-xs bg-transparent border-b text-center text-lg focus:outline-none transition-all duration-300" />
    </div>
  );
}

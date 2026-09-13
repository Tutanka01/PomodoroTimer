import React from 'react';
import { t } from './i18n.js';

export function Intention({ value, onChange }) {
  return (
    <div className="flex items-center justify-center w-full">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('intentionPlaceholder')}
        className="intention-field"
        aria-label={t('intentionPlaceholder')}
      />
    </div>
  );
}

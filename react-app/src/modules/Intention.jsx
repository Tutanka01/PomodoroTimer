import React from 'react';
import { t } from './i18n.js';

export function Intention({ value, onChange }) {
  return (
    <div className="intention-wrap">
      <label className="intention-label" htmlFor="intention-input">{t('intentionLabel')}</label>
      <input
        id="intention-input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('intentionPlaceholder')}
        className="intention-field"
        maxLength={120}
        autoComplete="off"
      />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { setTrack, play as audioPlay, pause as audioPause, setVolumeLinear, getIsPlaying, getCurrentUrl } from './ambientAudio.js';

// Discover all audio files in /react-app/sound automatically (mp3/ogg/wav)
// Vite will transform imported assets into URLs.
const soundModules = import.meta.glob('../../sound/*.{mp3,ogg,wav}', { eager: true });

function makeNameFromPath(path) {
  const filename = path.split('/').pop() || path;
  const name = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[+_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function SoundControl() {
  const tracks = useMemo(() => {
    const list = Object.entries(soundModules).map(([path, mod]) => ({
      id: path,
      url: mod.default || mod,
      name: makeNameFromPath(path)
    }));
    // Sort alphabetically for determinism
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('ambient.selectedId') || (tracks[0]?.id ?? ''));
  const [sliderVal, setSliderVal] = useState(() => {
    const saved = localStorage.getItem('ambient.volume.v2');
    // slider range is 0..1000; default a comfortable low level ~0.15
    return saved ? Number(saved) : 260;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  // Synchronise l'état local avec le singleton au montage
  useEffect(() => {
    // Appliquer volume initial depuis le slider (persisté)
    applyVolume(sliderVal);
    // Synchroniser piste sélectionnée selon l'état actuel du singleton
    const url = getCurrentUrl();
    if (url && tracks.length) {
      const match = tracks.find(t => t.url === url);
      if (match) setSelectedId(match.id);
    }
    setIsPlaying(getIsPlaying());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map slider 0..1000 to perceptual volume (linear curve)
  const applyVolume = (val) => {
    // Perceptual curve: first compress to 0..1, then square for finer control at low levels
    const x = Math.min(1000, Math.max(0, Number(val))) / 1000; // 0..1
    const linear = x * x; // bias low end for precision
    setVolumeLinear(linear);
  };

  useEffect(() => {
    applyVolume(sliderVal);
  }, [sliderVal]);

  // Load/Swap current track (via singleton)
  useEffect(() => {
    localStorage.setItem('ambient.selectedId', selectedId || '');
    if (!selectedId) return;
    const track = tracks.find(t => t.id === selectedId);
    if (!track) return;
    const wasPlaying = isPlaying;
    setLoading(true);
    try {
      setTrack(track.url);
      if (wasPlaying) {
        audioPlay()
          .then(() => setIsPlaying(true))
          .catch(err => console.error(err))
          .finally(() => setLoading(false));
      } else { setLoading(false); }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const togglePlay = async () => {
    if (!selectedId || loading) return;
    if (getIsPlaying()) { audioPause(); setIsPlaying(false); return; }
    try {
      setLoading(true);
      const track = tracks.find(t => t.id === selectedId);
      if (!track) return;
      if (getCurrentUrl() !== track.url) setTrack(track.url);
      await audioPlay();
      setIsPlaying(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onSlider = (e) => {
    const v = Number(e.target.value);
    setSliderVal(v);
    localStorage.setItem('ambient.volume.v2', String(v));
  };

  if (tracks.length === 0) {
    return null; // nothing to show if no assets
  }

  return (
    <div className="card">
      <div className="card-head">
        <h4 className="card-title">Ambience</h4>
        <button
          onClick={togglePlay}
          disabled={loading}
          className={`chip${isPlaying ? ' is-active' : ''}`}
          title={loading ? 'Loading…' : (isPlaying ? 'Stop' : 'Play')}
        >
          {loading ? '…' : (isPlaying ? 'Stop' : 'Play')}
        </button>
      </div>

      {tracks.length > 1 && (
        <div className="chip-row mb-3">
          {tracks.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`chip${selectedId === t.id ? ' is-active' : ''}`}
              title={t.name}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {tracks.length === 1 && (
        <div className="field-label mb-3">{tracks[0].name}</div>
      )}

      <input
        type="range"
        min="0"
        max="1000"
        step="1"
        value={sliderVal}
        onChange={onSlider}
        aria-label="Ambient volume"
        className="vol"
      />
    </div>
  );
}

import React from 'react';

const RANGE_COMMIT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown'
]);

const normalizeNumeric = (candidate, fallback = 0) => {
  const num = Number(candidate);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Reusable range input that previews locally while dragging or holding
 * navigation keys and publishes a single commit once on release (mouse,
 * touch, pointer, keyboard key-up, native change when idle, or blur).
 */
const CommitOnReleaseRange = ({
  value,
  onCommit,
  onPreview = null,
  min,
  max,
  step,
  disabled = false,
  className = '',
  ...inputProps
}) => {
  const savedValue = normalizeNumeric(value, 0);
  const [draft, setDraft] = React.useState(null);
  const inputRef = React.useRef(null);
  const stagedRef = React.useRef(null);
  const activePointerRef = React.useRef(false);
  const activeKeyRef = React.useRef(false);
  const pendingCommitValueRef = React.useRef(null);
  const prevSavedValueRef = React.useRef(savedValue);
  const latestCommitRef = React.useRef(0);
  const onCommitRef = React.useRef(onCommit);
  const onPreviewRef = React.useRef(onPreview);

  React.useEffect(() => {
    onCommitRef.current = onCommit;
    onPreviewRef.current = onPreview;
  }, [onCommit, onPreview]);

  const shownValue = draft === null ? savedValue : draft;

  React.useEffect(() => {
    const savedChanged = prevSavedValueRef.current !== savedValue;
    prevSavedValueRef.current = savedValue;
    if (
      draft !== null
      && stagedRef.current === null
      && (savedValue === draft || (savedChanged && pendingCommitValueRef.current === null))
    ) {
      pendingCommitValueRef.current = null;
      setDraft(null);
      onPreviewRef.current?.(null);
    }
  }, [draft, savedValue]);

  const commit = React.useCallback(() => {
    if (stagedRef.current === null) return;
    const next = stagedRef.current;
    stagedRef.current = null;
    if (next === savedValue) {
      pendingCommitValueRef.current = null;
      setDraft(null);
      onPreviewRef.current?.(null);
      return;
    }
    pendingCommitValueRef.current = next;
    const commitId = ++latestCommitRef.current;
    try {
      const result = onCommitRef.current?.(next);
      Promise.resolve(result).then(outcome => {
        if (outcome === null && latestCommitRef.current === commitId && stagedRef.current === null) {
          pendingCommitValueRef.current = null;
          setDraft(null);
          onPreviewRef.current?.(null);
        }
      }).catch(() => {
        if (latestCommitRef.current === commitId && stagedRef.current === null) {
          pendingCommitValueRef.current = null;
          setDraft(null);
          onPreviewRef.current?.(null);
        }
      });
    } catch {
      if (latestCommitRef.current === commitId) {
        pendingCommitValueRef.current = null;
        setDraft(null);
        onPreviewRef.current?.(null);
      }
    }
  }, [savedValue]);

  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
    const handleGlobalRelease = () => {
      if (!activePointerRef.current) return;
      activePointerRef.current = false;
      commitRef.current();
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    window.addEventListener('touchcancel', handleGlobalRelease);
    return () => {
      window.removeEventListener?.('pointerup', handleGlobalRelease);
      window.removeEventListener?.('pointercancel', handleGlobalRelease);
      window.removeEventListener?.('mouseup', handleGlobalRelease);
      window.removeEventListener?.('touchend', handleGlobalRelease);
      window.removeEventListener?.('touchcancel', handleGlobalRelease);
    };
  }, []);

  React.useEffect(() => {
    const el = inputRef.current;
    if (!el || typeof el.addEventListener !== 'function') return undefined;
    const handleNativeChange = () => {
      if (!activePointerRef.current && !activeKeyRef.current && stagedRef.current !== null) {
        commitRef.current();
      }
    };
    el.addEventListener('change', handleNativeChange);
    return () => el.removeEventListener('change', handleNativeChange);
  }, []);

  const preview = event => {
    const next = Number(event?.target?.value);
    if (!Number.isFinite(next)) return;
    pendingCommitValueRef.current = null;
    stagedRef.current = next;
    setDraft(next);
    onPreviewRef.current?.(next);
  };

  const handlePointerStart = () => {
    activePointerRef.current = true;
  };

  const handlePointerEnd = () => {
    activePointerRef.current = false;
    commit();
  };

  const handleKeyDown = event => {
    if (RANGE_COMMIT_KEYS.has(event?.key)) {
      activeKeyRef.current = true;
    }
  };

  const handleKeyUp = event => {
    if (RANGE_COMMIT_KEYS.has(event?.key) || activeKeyRef.current) {
      activeKeyRef.current = false;
      commit();
    }
  };

  const handleBlur = () => {
    activePointerRef.current = false;
    activeKeyRef.current = false;
    commit();
  };

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type="range"
      min={min}
      max={max}
      step={step}
      value={shownValue}
      disabled={disabled}
      className={className}
      onChange={preview}
      onPointerDown={handlePointerStart}
      onMouseDown={handlePointerStart}
      onTouchStart={handlePointerStart}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onMouseUp={handlePointerEnd}
      onTouchEnd={handlePointerEnd}
      onTouchCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
    />
  );
};

export default React.memo(CommitOnReleaseRange);

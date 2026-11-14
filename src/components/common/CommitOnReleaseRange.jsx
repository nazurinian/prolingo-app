import React, { useEffect, useRef, useState } from 'react';

/**
 * Keep range input changes local while dragging. Publish a single final value
 * on pointer release, keyboard key-up, or blur (without a timer/debounce).
 *
 * This is a presentational component: persistence remains the caller's job.
 * An async onCommit resolving to null is treated as a rejected write and
 * returns the display to the last confirmed prop value.
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
  const savedValue = Number(value);
  const [draft, setDraft] = useState(null);
  const stagedRef = useRef(null);
  const latestCommitRef = useRef(0);

  const shownValue = draft === null ? savedValue : draft;

  useEffect(() => {
    if (draft !== null && stagedRef.current === null && savedValue === draft) {
      setDraft(null);
      onPreview?.(null);
    }
  }, [draft, savedValue, onPreview]);

  const preview = event => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    stagedRef.current = next;
    setDraft(next);
    onPreview?.(next);
  };

  const commit = () => {
    if (stagedRef.current === null) return;
    const next = stagedRef.current;
    stagedRef.current = null;
    if (next === savedValue) {
      setDraft(null);
      onPreview?.(null);
      return;
    }
    const commitId = ++latestCommitRef.current;
    try {
      const result = onCommit?.(next);
      Promise.resolve(result).then(outcome => {
        if (outcome === null && latestCommitRef.current === commitId && stagedRef.current === null) {
          setDraft(null);
          onPreview?.(null);
        }
      }).catch(() => {
        if (latestCommitRef.current === commitId && stagedRef.current === null) {
          setDraft(null);
          onPreview?.(null);
        }
      });
    } catch {
      if (latestCommitRef.current === commitId) {
        setDraft(null);
        onPreview?.(null);
      }
    }
  };

  return (
    <input
      {...inputProps}
      type="range"
      min={min}
      max={max}
      step={step}
      value={shownValue}
      disabled={disabled}
      className={className}
      onChange={preview}
      onPointerUp={commit}
      onPointerCancel={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
};

export default React.memo(CommitOnReleaseRange);

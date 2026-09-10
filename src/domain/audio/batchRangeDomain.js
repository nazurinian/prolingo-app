const toSafeMax = max => Math.max(1, Number(max) || 1);

export const clampBatchRangeNumber = (value, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(1, parsed), toSafeMax(max));
};

export const resolveBatchRangeConfig = ({ batchConfig, field, value, max }) => {
  const safeMax = toSafeMax(max);
  let start = clampBatchRangeNumber(batchConfig?.start, safeMax);
  let end = clampBatchRangeNumber(batchConfig?.end, safeMax);
  const nextValue = clampBatchRangeNumber(value, safeMax);

  if (field === 'start') {
    start = nextValue;
    if (start > end) end = start;
  } else if (field === 'end') {
    end = nextValue;
    if (end < start) start = end;
  }

  return { ...batchConfig, start, end };
};

export const resolveStructuredDeleteRecords = (records, itemId) => (
  records.filter(row => row.id !== itemId)
);

export const resolveStructuredDeleteStudyQueue = (queue, itemId) => (
  queue.filter(id => id !== itemId)
);

export const shouldClearStructuredDeleteReference = (value, itemId) => value === itemId;

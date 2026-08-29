export const resolveSnapshotValidIds = (records) => (
  new Set(records.map(item => item.id))
);

export const filterStudyQueueByValidIds = (queue, validIds) => (
  queue.filter(id => validIds.has(id))
);

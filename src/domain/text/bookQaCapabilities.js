const nativeCommands = new Set([
  'collection.create', 'collection.update', 'collection.reorder', 'collection.delete',
  'document.create', 'document.update', 'document.reorder', 'document.delete',
  'block.create', 'block.update', 'block.reorder', 'block.delete',
  'contentUnit.create', 'contentUnit.update', 'contentUnit.reorder', 'contentUnit.delete',
  'contentUnit.split', 'contentUnit.merge', 'contentUnit.reorderSegments',
  'speaker.register', 'speaker.rename', 'speaker.remove',
  'segment.create', 'segment.update', 'segment.delete', 'segment.move',
  'paragraphSegment.split', 'paragraphSegments.merge',
  'conversationSegment.split', 'conversationSegments.merge',
  'bookPack.import'
]);

export const isBookQaNativeCommand = command => nativeCommands.has(command?.type);
export const isBookQaDestructiveCommand = command => /\.(delete|merge|remove)$/u.test(command?.type ?? '');
export const isBookQaWorkspace = document => document?.editorModel === 'structured-v1'
  && ['paragraph', 'conversation', 'mixed'].includes(document.documentType);

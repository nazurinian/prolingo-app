const nativeCommands = new Set([
  'collection.create', 'collection.update', 'document.create', 'document.update',
  'block.create', 'contentUnit.create', 'speaker.register', 'segment.create'
]);

export const isBookQaNativeCommand = command => nativeCommands.has(command?.type);
export const isBookQaWorkspace = document => document?.editorModel === 'structured-v1'
  && ['paragraph', 'conversation', 'mixed'].includes(document.documentType);

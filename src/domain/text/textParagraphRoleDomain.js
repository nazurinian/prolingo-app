export const TEXT_PARAGRAPH_CARD_ROLES = Object.freeze({
  TITLE: 'title',
  PARAGRAPH: 'paragraph'
});

export const TEXT_PARAGRAPH_ROLE_METADATA_KEY = 'paragraphRoleV1';

const normalizeMetadata = metadata => metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

export const normalizeTextParagraphCardRole = value => value === TEXT_PARAGRAPH_CARD_ROLES.TITLE
  ? TEXT_PARAGRAPH_CARD_ROLES.TITLE
  : TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH;

export const resolveTextParagraphCardRole = block => {
  if (!block || block.blockType !== 'paragraph') return null;
  return normalizeTextParagraphCardRole(normalizeMetadata(block.metadata)?.[TEXT_PARAGRAPH_ROLE_METADATA_KEY]);
};

export const buildTextParagraphCardRoleMetadata = ({ metadata, role }) => ({
  ...normalizeMetadata(metadata),
  [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: normalizeTextParagraphCardRole(role)
});

export const getTextParagraphCardRoleLabel = role => normalizeTextParagraphCardRole(role) === TEXT_PARAGRAPH_CARD_ROLES.TITLE
  ? 'Title'
  : 'Paragraph';

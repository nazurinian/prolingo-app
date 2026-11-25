import assert from 'node:assert/strict';
import { distributeNotebookTranslation, tokenizeNotebookText } from '../src/components/text/presentation/notebookParallelFlowLayout.js';

const width = text => text.length;
const text = '  One,  two three. ';
assert.equal(tokenizeNotebookText(text).join(''), text);
const allocation = distributeNotebookTranslation(text, [8, 2, 8], width);
assert.equal(allocation.join(''), text);
assert.equal(allocation[1], '');
assert.ok(allocation[0].includes('One,') && allocation[2].includes('three.'));
assert.deepEqual(distributeNotebookTranslation('leading', [2, 8], width), ['', 'leading']);
assert.deepEqual(distributeNotebookTranslation('end word', [9, 2], width), ['end word', '']);
assert.equal(distributeNotebookTranslation('unbreakable', [3, 8, 10], width), null);
assert.equal(distributeNotebookTranslation('one two three four five', [5], width), null);
assert.deepEqual(distributeNotebookTranslation('', [2, 3], width), ['', '']);
console.log('PASS 4C3 deterministic allocation, ordered narrow stubs, losslessness and overflow');

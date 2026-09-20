import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');
const outputPath = path.join(root, 'docs', 'M1_FUNCTION_WIRING_AUDIT.md');

const parserPlugins = [
  'jsx',
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'objectRestSpread',
  'optionalChaining',
  'nullishCoalescingOperator',
  'dynamicImport',
  'topLevelAwait',
  'importMeta'
];

const knownMappings = new Map([
  ['DownloadCloudIcon', ['lucide-react DownloadCloudIcon alias', 'Custom inline SVG replaced by lucide icon alias in BatchPopup and MobileTools.']],
  ['renderBatchPopup', ['BatchPopup', 'Extracted component, rendered from Sidebar via renderBatchPopup prop.']],
  ['renderPlaybackSequenceBuilder', ['PlaybackSequenceBuilder', 'Extracted component, rendered by MobileTools and Sidebar controls.']],
  ['renderControlSectionTabs', ['ControlSectionTabs', 'Extracted component, rendered by MobileTools and Sidebar controls.']],
  ['renderMobileTools', ['MobileTools', 'Extracted component, rendered in App mobile table area.']],
  ['renderWorkspaceTabs', ['WorkspaceTabs', 'Extracted component, rendered in App table area.']],
  ['renderMasterDataToolbar', ['MasterDataToolbar', 'Extracted component, rendered in App table toolbar.']],
  ['playTTS', ['playBrowserTTS', 'Renamed internal playback helper.']],
  ['fallbackToTTS', ['playSource', 'Merged into local-audio failure fallback path.']],
  ['cleanupAudio', ['playLocalAudio', 'Kept as local cleanup closure inside playLocalAudio.']],
  ['getLocalAudioUrl', ['playSource', 'Merged into local audio key resolution inside playSource.']],
  ['getPriority', ['getEnglishVoicePriority', 'Extracted UK/US/AU/SG voice priority helper.']],
  ['loadVoices', ['updateVoices', 'Renamed voice loader effect helper.']],
  ['handleAddTextItem', ['handleAddSingleTextItem', 'Renamed text-mode add handler.']],
  ['pushUndoSnapshot', ['pushUndoAction', 'Renamed undo registration helper.']],
  ['deleteStructuredItem', ['handleDeleteRequest', 'Deletion is routed through confirm modal flow.']],
  ['_setScrollPos', ['pendingScrollRestoration', 'Scroll restoration is now handled through pending restoration effect.']],
  ['handleWindowScroll', ['handleContainerScroll', 'Scroll handler moved to virtualized container path.']],
  ['handleResize', ['checkMobile', 'Resize/mobile height logic renamed in responsive effect.']],
  ['handleGlobalClick', ['setActiveMenuId(null)', 'Menu close behavior kept inline/effect-level.']],
  ['handleMenuToggle', ['onMenuToggle prop', 'Menu toggle is now passed inline to MemoizedRow.']],
  ['checkScrollComplete', ['pendingScrollRestoration', 'Scroll completion check replaced by requestAnimationFrame restoration.']],
  ['scrollAction', ['pendingScrollRestoration', 'Scroll action replaced by layout restoration effect.']]
]);

const reverseKnownMappings = new Map();
for (const [baselineName, [targetName, note]] of knownMappings) {
  if (!reverseKnownMappings.has(targetName)) reverseKnownMappings.set(targetName, []);
  reverseKnownMappings.get(targetName).push({ baselineName, note });
}

const knownAddedStatuses = new Map([
  ['BottomPlayerBar', 'Extracted component, imported and rendered by App with play/pause/stop/nav props.'],
  ['ChangeReviewModal', 'Extracted modal component, imported and rendered by App.'],
  ['ClearViewModal', 'Extracted confirm modal, imported and rendered by App.'],
  ['DeleteDeckModal', 'Extracted confirm modal, imported and rendered by App.'],
  ['DeleteVocabularyModal', 'Extracted confirm modal, imported and rendered by App.'],
  ['Header', 'Extracted layout component, imported and rendered by App.'],
  ['ManualEditorModal', 'Extracted modal component, imported and rendered by App.'],
  ['RevertAllConfirmModal', 'Extracted confirm modal, imported and rendered by App.'],
  ['Sidebar', 'Extracted layout component, imported and rendered by App with render props and tool props.'],
  ['checkMobile', 'Responsive helper for mobile layout and container height.'],
  ['cleanup', 'Internal playLocalAudio cleanup closure.'],
  ['getCsvMetaBaseName', 'New M1.1 CSV metadata helper.'],
  ['getPreferredEnglishVoice', 'New M1.2 browser voice fallback helper.'],
  ['getPreferredIndonesianVoice', 'New M1.2 Indonesian browser voice helper.'],
  ['isMultiSourceMode', 'Derived state helper for multi-source CSV workflow.'],
  ['masterPOSOptions', 'Derived state helper for Master Data part-of-speech filters.'],
  ['normalizeCsvMeta', 'New M1.1 CSV metadata helper.'],
  ['readCachedCsvMeta', 'New M1.1 CSV metadata helper.'],
  ['scrollToBottom', 'New M1.7 terminal/log auto-scroll helper.'],
  ['sortEnglishVoicesByPreference', 'New M1.2 browser voice priority helper.'],
  ['toggleVocabularyPlayOrder', 'UI adapter for existing vocabulary order change flow.'],
  ['writeCachedCsvMeta', 'New M1.1 CSV metadata helper.']
]);

const namedCallbackWrappers = new Set([
  'useCallback',
  'React.useCallback',
  'useMemo',
  'React.useMemo',
  'memo',
  'React.memo',
  'forwardRef',
  'React.forwardRef'
]);

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (/\.(jsx?|mjs|cjs)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

function calleeName(callee) {
  if (!callee) return '';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') {
    return `${calleeName(callee.object)}.${calleeName(callee.property)}`;
  }
  return callee.type;
}

function isFunctionNode(node) {
  return node && (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function isNamedCallbackWrapper(callExpression) {
  return namedCallbackWrappers.has(calleeName(callExpression.callee));
}

function collectFunctions(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = parse(code, {
    sourceType: 'module',
    plugins: parserPlugins,
    errorRecovery: true
  });
  const relPath = path.relative(root, filePath).replaceAll('\\', '/');
  const functions = [];
  const seen = new Set();

  const push = (name, kind, node) => {
    if (!name || !node?.loc) return;
    const key = `${name}|${kind}|${relPath}|${node.loc.start.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    functions.push({ name, kind, file: relPath, line: node.loc.start.line });
  };

  traverse(ast, {
    FunctionDeclaration(pathRef) {
      push(pathRef.node.id?.name, 'function', pathRef.node);
    },
    VariableDeclarator(pathRef) {
      const { id, init } = pathRef.node;
      if (id.type !== 'Identifier') return;
      if (isFunctionNode(init)) {
        push(id.name, init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function-expr', init);
        return;
      }
      if (
        init?.type === 'CallExpression' &&
        isNamedCallbackWrapper(init) &&
        isFunctionNode(init.arguments?.[0])
      ) {
        push(id.name, `${calleeName(init.callee)} callback`, init.arguments[0]);
      }
    },
    ObjectMethod(pathRef) {
      const { key } = pathRef.node;
      push(key.type === 'Identifier' ? key.name : key.value, 'object-method', pathRef.node);
    },
    ObjectProperty(pathRef) {
      const { key, value } = pathRef.node;
      if (!isFunctionNode(value)) return;
      push(key.type === 'Identifier' ? key.name : key.value, 'object-property-fn', value);
    },
    ExportDefaultDeclaration(pathRef) {
      const declaration = pathRef.node.declaration;
      if (isFunctionNode(declaration)) {
        push(declaration.id?.name || 'default', 'default-export-fn', declaration);
      }
    }
  });

  return functions.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}

function groupByName(functions) {
  const grouped = new Map();
  for (const fn of functions) {
    if (!grouped.has(fn.name)) grouped.set(fn.name, []);
    grouped.get(fn.name).push(fn);
  }
  return grouped;
}

function formatLocation(fn) {
  return `${fn.file}:${fn.line}`;
}

function formatFunctionList(functions) {
  return functions
    .map((fn) => `| ${fn.name} | ${fn.kind} | ${formatLocation(fn)} |`)
    .join('\n');
}

function formatNameList(names, sourceMap, counterpartMap) {
  if (!names.length) return '_None._';
  return names.map((name) => {
    const locs = sourceMap.get(name).map(formatLocation).join('<br>');
    const mapping = knownMappings.get(name);
    const reverseMappings = reverseKnownMappings.get(name);
    const counterpart = counterpartMap.get(name)
      ? 'Same-name match exists'
      : mapping
        ? `${mapping[0]} - ${mapping[1]}`
        : reverseMappings
          ? reverseMappings.map(({ baselineName, note }) => `Mapped from ${baselineName} - ${note}`).join('<br>')
          : knownAddedStatuses.get(name) || 'Needs manual review';
    return `| ${name} | ${locs} | ${counterpart} |`;
  }).join('\n');
}

const baselinePath = path.join(srcRoot, '_backup_app_v5116.jsx');
const baselineFunctions = collectFunctions(baselinePath);
const modularFiles = listSourceFiles(srcRoot).filter((file) => !file.endsWith('_backup_app_v5116.jsx'));
const modularFunctions = modularFiles.flatMap(collectFunctions)
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));

const baselineByName = groupByName(baselineFunctions);
const modularByName = groupByName(modularFunctions);
const missingNames = [...baselineByName.keys()].filter((name) => !modularByName.has(name)).sort();
const addedNames = [...modularByName.keys()].filter((name) => !baselineByName.has(name)).sort();
const recognizedMissing = missingNames.filter((name) => knownMappings.has(name)).length;
const needsManualReview = missingNames.length - recognizedMissing;

const markdown = `# M1 Function Wiring Audit

Generated by \`scripts/audit-v5116-functions.mjs\`.

## Summary

| Source | Function-like entries | Unique names |
| --- | ---: | ---: |
| \`src/_backup_app_v5116.jsx\` | ${baselineFunctions.length} | ${baselineByName.size} |
| Modular \`src\` files | ${modularFunctions.length} | ${modularByName.size} |

| Comparison | Count |
| --- | ---: |
| Missing by same name from modular | ${missingNames.length} |
| New or renamed in modular | ${addedNames.length} |
| Missing names with known rename/extraction mapping | ${recognizedMissing} |
| Missing names still needing manual review | ${needsManualReview} |

## Missing From Modular By Same Name

| Baseline name | Backup location | Current mapping/status |
| --- | --- | --- |
${formatNameList(missingNames, baselineByName, modularByName)}

## Added Or Renamed In Modular By Same Name

| Modular name | Current location | Status |
| --- | --- | --- |
${formatNameList(addedNames, modularByName, baselineByName)}

## Baseline Function Inventory

| Name | Kind | Location |
| --- | --- | --- |
${formatFunctionList(baselineFunctions)}

## Modular Function Inventory

| Name | Kind | Location |
| --- | --- | --- |
${formatFunctionList(modularFunctions)}
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown, 'utf8');

console.log(`Wrote ${path.relative(root, outputPath).replaceAll('\\', '/')}`);
console.log(`Baseline: ${baselineFunctions.length} entries, ${baselineByName.size} unique names`);
console.log(`Modular: ${modularFunctions.length} entries, ${modularByName.size} unique names`);
console.log(`Missing by same name: ${missingNames.length} (${recognizedMissing} mapped, ${needsManualReview} manual review)`);

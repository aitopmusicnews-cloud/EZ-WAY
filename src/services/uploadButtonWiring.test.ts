import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const uploadZonePath = fileURLToPath(new URL('../components/UploadZone.tsx', import.meta.url));
const text = readFileSync(uploadZonePath, 'utf8');
const source = ts.createSourceFile(uploadZonePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const literalAttr = (attributes: ts.JsxAttributes, name: string): string => {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText(source) !== name) continue;
    return ts.isStringLiteral(property.initializer) ? property.initializer.text : '';
  }
  return '';
};

const hasLabelAncestor = (node: ts.Node): boolean => {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && current.openingElement.tagName.getText(source) === 'label') {
      return true;
    }
    current = current.parent;
  }
  return false;
};

test('UploadZone native file inputs live inside their clickable labels', () => {
  const unnested: string[] = [];
  let pickerCount = 0;

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input') {
      const type = literalAttr(node.attributes, 'type');
      if (type === 'file') {
        pickerCount += 1;
        if (!hasLabelAncestor(node)) {
          unnested.push(literalAttr(node.attributes, 'id') || `picker-${pickerCount}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);

  assert.equal(pickerCount, 5, 'UploadZone should expose five native file pickers');
  assert.deepEqual(
    unnested,
    [],
    `File inputs outside their clickable labels: ${unnested.join(', ')}`,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

const walkTsx = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);
  const stat = statSync(full);
  if (stat.isDirectory()) return walkTsx(full);
  return full.endsWith('.tsx') ? [full] : [];
});

const attrNames = (attributes: ts.JsxAttributes) => new Set(
  attributes.properties
    .filter(ts.isJsxAttribute)
    .map((attribute) => attribute.name.getText()),
);

const literalType = (attributes: ts.JsxAttributes): string => {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText() !== 'type') continue;
    return ts.isStringLiteral(property.initializer) ? property.initializer.text : '';
  }
  return '';
};

test('every rendered button has an actionable event or submit behavior', () => {
  const failures: string[] = [];

  for (const file of walkTsx(SRC_ROOT)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node: ts.Node) => {
      const opening = ts.isJsxElement(node)
        ? node.openingElement
        : ts.isJsxSelfClosingElement(node)
          ? node
          : null;

      if (opening && opening.tagName.getText(source) === 'button') {
        const names = attrNames(opening.attributes);
        const actionable = names.has('onClick')
          || names.has('onMouseDown')
          || names.has('onPointerDown')
          || names.has('formAction')
          || literalType(opening.attributes) === 'submit';

        if (!actionable) {
          const position = source.getLineAndCharacterOfPosition(opening.getStart(source));
          failures.push(`${path.relative(SRC_ROOT, file)}:${position.line + 1}`);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  assert.deepEqual(failures, [], `Buttons without actions: ${failures.join(', ')}`);
});

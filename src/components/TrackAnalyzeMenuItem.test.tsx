import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('track tools expose a clickable Analyze Track action', async () => {
  const menuModule = await import('./TrackOptionsMenu.tsx');
  const TrackAnalyzeMenuItem = (menuModule as any).TrackAnalyzeMenuItem;

  assert.equal(typeof TrackAnalyzeMenuItem, 'function');

  let clicks = 0;
  const element = TrackAnalyzeMenuItem({ onAnalyze: () => { clicks += 1; } });
  const markup = renderToStaticMarkup(React.createElement(TrackAnalyzeMenuItem, {
    onAnalyze: () => { clicks += 1; },
  }));

  assert.match(markup, /Analyze Track<\/button>/);
  element.props.onClick();
  assert.equal(clicks, 1);
});

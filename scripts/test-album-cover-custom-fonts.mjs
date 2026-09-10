import fs from 'node:fs';

const service = fs.readFileSync('src/services/albumCoverStudio.ts', 'utf8');
const component = fs.readFileSync('src/components/AlbumCoverStudio.tsx', 'utf8');

const expected = [
  ['armadillo', 'Armadillo'],
  ['charles-wright-singapore', 'Charles Wright Singapore'],
  ['oxidaren', 'Oxidaren'],
  ['scapholene', 'Scapholene'],
  ['serati', 'Serati'],
  ['trigram', 'Trigram'],
  ['achtung-bravo', 'Achtung Bravo'],
  ['asterisk-mono', 'Asterisk Mono'],
  ['chainsaw-carnage', 'Chainsaw Carnage'],
  ['digit-tech', 'Digit Tech'],
  ['dystopian-canticle', 'Dystopian Canticle'],
  ['eightgon', 'Eightgon'],
  ['goodlookingfont', 'GoodLookingFont'],
  ['help-me', 'Help Me'],
  ['jogrunge', 'JOGRUNGE'],
  ['london-psycho', 'London Psycho'],
  ['lumierepolis', 'Lumierepolis'],
  ['midnight-letters', 'Midnight Letters'],
  ['moonlit-flow', 'Moonlit Flow'],
  ['powderworks', 'Powderworks'],
];

if (!service.includes('ALBUM_COVER_FONT_OPTIONS')) {
  throw new Error('Album Cover service must export ALBUM_COVER_FONT_OPTIONS.');
}
for (const [value, label] of expected) {
  if (!service.includes(`value: '${value}'`) || !service.includes(`label: '${label}'`)) {
    throw new Error(`Missing custom font option: ${label} (${value})`);
  }
}
if (!component.includes('<optgroup label="Custom Fonts">')) {
  throw new Error('Album Cover Studio must group uploaded families under Custom Fonts.');
}
if (!component.includes('ALBUM_COVER_FONT_OPTIONS.filter') || !component.includes('.map((font)')) {
  throw new Error('Album Cover Studio must render font selectors from ALBUM_COVER_FONT_OPTIONS.');
}
if (component.includes('<option value="editorial">Editorial</option>')) {
  throw new Error('Album Cover Studio still hard-codes the old font selector options.');
}

console.log(`Album Cover custom font contract passed (${expected.length} custom families).`);

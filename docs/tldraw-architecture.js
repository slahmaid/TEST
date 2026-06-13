// Run in Cursor tldraw (plugin-tldraw exec) when the canvas panel is open.
// Creates the Prumysl site architecture diagram.

editor.createShape({ _type: 'rectangle', shapeId: 'hub', x: 380, y: 40, w: 200, h: 80, text: 'prumysl.cc\nindex.html', color: 'blue' });

[
  { id: 'moka', label: 'Moka\nmoka/', x: 60, y: 200 },
  { id: 'promax', label: 'Moka Pro Max\nmoka-pro-max/', x: 260, y: 200 },
  { id: 'saqr', label: 'Saqr\nsaqr/', x: 460, y: 200 },
  { id: 'proj', label: 'Projectors\nprojectors/', x: 660, y: 200 }
].forEach(function (p) {
  editor.createShape({ _type: 'rectangle', shapeId: p.id, x: p.x, y: p.y, w: 170, h: 72, text: p.label, color: 'light-blue' });
  editor.createShape({ _type: 'arrow', shapeId: 'arr-' + p.id, fromId: 'hub', toId: p.id });
});

[
  { id: 'firebase', label: 'Firebase\norders-firebase.js', x: 80, y: 340 },
  { id: 'sheets', label: 'Google Sheets\norders-sheet.js', x: 320, y: 340 },
  { id: 'gas', label: 'Apps Script\ngoogle-apps-script/', x: 560, y: 340 }
].forEach(function (b) {
  editor.createShape({ _type: 'rectangle', shapeId: b.id, x: b.x, y: b.y, w: 190, h: 70, text: b.label, color: 'violet' });
  editor.createShape({ _type: 'arrow', shapeId: 'back-' + b.id, fromId: 'moka', toId: b.id, color: 'grey' });
});

editor.createShape({ _type: 'rectangle', shapeId: 'admin', x: 360, y: 460, w: 180, h: 64, text: 'admin/\norders dashboard', color: 'orange' });
editor.createShape({ _type: 'arrow', shapeId: 'arr-admin', fromId: 'sheets', toId: 'admin' });

boxShapes(['hub', 'moka', 'promax', 'saqr', 'proj'], { text: 'Landing pages', color: 'blue' });
boxShapes(['firebase', 'sheets', 'gas', 'admin'], { text: 'Order pipeline', color: 'violet' });
editor.zoomToFit();

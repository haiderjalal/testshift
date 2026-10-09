import assert from "node:assert/strict";
import { test } from "node:test";

import { PNG } from "pngjs";

import { compareScreenshots, decodePng, visualSeverity } from "../src/lib/visual";

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const white = () => [255, 255, 255] as [number, number, number];

test("identical screenshots match with no diff image", () => {
  const a = image(200, 200, white);
  const result = compareScreenshots(a, image(200, 200, white));
  assert.equal(result.outcome, "match");
  assert.equal(result.changedPixels, 0);
  assert.equal(result.diffPng, null);
  assert.equal(visualSeverity(result), null);
});

test("a change below the limit still matches (0.1% of pixels or fewer)", () => {
  // 200x200 = 40,000 px; 10 changed pixels is 0.025%.
  const current = image(200, 200, (x, y) => (x < 10 && y === 0 ? [0, 0, 0] : white()));
  const result = compareScreenshots(image(200, 200, white), current);
  assert.equal(result.outcome, "match");
  assert.ok(result.changedPixels > 0 && result.changedPixels <= 40);
});

test("a visible change is reported, with a highlighted diff and a minor grade when small", () => {
  // A 200x200 block (4% of the page) changed.
  const current = image(200, 200, (x, y) => (x < 20 && y < 100 ? [255, 0, 0] : white()));
  const result = compareScreenshots(image(200, 200, white), current);
  assert.equal(result.outcome, "changed");
  assert.ok(result.diffPng && result.diffPng.length > 0);
  assert.equal(visualSeverity(result), "minor");
});

test("a large change is graded major", () => {
  const current = image(200, 200, () => [0, 0, 0]);
  const result = compareScreenshots(image(200, 200, white), current);
  assert.equal(result.outcome, "changed");
  assert.equal(visualSeverity(result), "major");
});

test("different page heights are reported as a size change, not compared pixel by pixel", () => {
  const result = compareScreenshots(image(200, 200, white), image(200, 260, white));
  assert.equal(result.outcome, "size-changed");
  assert.equal(result.diffPng, null);
  assert.equal(visualSeverity(result), "major");
});

test("decodePng reports the dimensions of a capture", () => {
  assert.deepEqual(decodePng(image(37, 11, white)), { width: 37, height: 11 });
});

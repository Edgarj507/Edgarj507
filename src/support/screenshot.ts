import { SCREENSHOT_MAX_CHARS } from '../ops/model';

const MAX_INPUT_BYTES = 10_000_000;
const MAX_EDGE = 1280;

/**
 * Re-encode an uploaded screenshot through a canvas: proves it decodes as an image, strips
 * EXIF/GPS metadata, caps it at 1280 px and returns a compact JPEG data URL.
 */
export async function prepareScreenshot(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|heic|heif|gif)$/.test(file.type)) throw new Error('Choose an image (PNG, JPG, WebP).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is larger than 10 MB.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('That file is not a readable image.'); });
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.8, 0.65, 0.5, 0.35]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= SCREENSHOT_MAX_CHARS) return url;
  }
  throw new Error('Screenshot is too detailed to attach — try cropping it.');
}

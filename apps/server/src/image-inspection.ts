import { chromium } from 'playwright';
import { browserOptions } from './browser.js';
import type { Design } from '../../../packages/shared/types.js';

/** Alpha bounds describe transparent pixels only, never a photographic subject. */
export async function inspectImage(image: { data: string; mimeType: string }, asset: Design['assets'][number], signal: AbortSignal) {
  signal.throwIfAborted();
  const bytes = Buffer.from(image.data, 'base64');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || !bytes.length || bytes.length > 20_000_000) throw new Error('Unsupported image format or byte limit');
  const signature = image.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : image.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!signature) throw new Error('Image format signature mismatch');
  const browser = await chromium.launch({ headless: true, timeout: 30_000, ...await browserOptions() });
  const abort = () => { void browser.close(); }; signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    const technical = await page.evaluate(async ({ data, mime }) => {
      const img = new Image(); img.src = `data:${mime};base64,${data}`; await img.decode();
      const width = img.naturalWidth, height = img.naturalHeight;
      if (!width || !height || width * height > 16_000_000) throw new Error('Image pixel limit');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img,0,0);
      const pixels = ctx.getImageData(0,0,width,height).data;
      let transparent = 0, left = width, top = height, right = -1, bottom = -1;
      for (let y=0;y<height;y++) for(let x=0;x<width;x++) { const alpha = pixels[(y*width+x)*4+3]; if(alpha<255) transparent++; if(alpha>8) { left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y); } }
      return { alpha_threshold: 8, width, height, aspect: width/height, has_transparency: transparent>0, alpha_bounds: right<0 ? null : { left, top, right, bottom }, transparent_fraction: transparent/(width*height) };
    }, { data: image.data, mime: image.mimeType });
    if (!technical.alpha_bounds) throw new Error('Image has no visible pixels');
    if (Math.abs(technical.aspect/(asset.width/asset.height)-1) > 0.25) throw new Error('Image aspect ratio does not match commission');
    if (asset.commission.transparent === 'required' && !technical.has_transparency) throw new Error('Commission requires transparency');
    if (asset.commission.transparent === 'opaque' && technical.has_transparency) throw new Error('Commission requires opaque pixels');
    signal.throwIfAborted();
    return { ...technical, bytes: bytes.length, mime: image.mimeType };
  } finally { signal.removeEventListener('abort', abort); await browser.close(); }
}

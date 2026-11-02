import { load } from 'cheerio';

/** The packaged library is restored by save_html, not authored by the model. */
export function authoredHtml(html: string) {
  const $ = load(html);
  $("script[data-dreamatic-runtime='d3']").remove();
  for (const el of $('img[data-asset-id]')) {
    if ($(el).attr('src')?.startsWith('data:')) $(el).removeAttr('src');
  }
  return $.html();
}

export function patchHtml(html: string, replacements: { old_text: string; new_text: string }[]) {
  if (!replacements.length) throw new Error('Provide at least one exact replacement.');
  let next = html;
  for (const { old_text, new_text } of replacements) {
    if (!old_text || next.split(old_text).length !== 2)
      throw new Error('old_text must match exactly once. Read the current HTML and include more surrounding text.');
    next = next.replace(old_text, () => new_text);
  }
  return next;
}

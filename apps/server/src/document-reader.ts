import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import Turndown from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { load } from "cheerio";
import { setting } from "./config-store.js";
export function extractSource(response: { text: string; contentType: string; url: string; status?: number }) {
  const html = /html/i.test(response.contentType), $ = load(response.text);
  let title = html ? ($("title").text().trim() || response.url) : response.url;
  let date = $("meta[property='article:published_time'],meta[name='date'],meta[name='dc.date']").first().attr("content") || $("time[datetime]").first().attr("datetime") || "";
  $("script,style,nav,footer,noscript,template,aside,[aria-hidden='true']").remove();
  const candidates = $("article,main,[role='main']").toArray().sort((a, b) => $(b).text().length - $(a).text().length);
  let body = candidates.length ? $(candidates[0]).html() || "" : $("body").html() || "";
  const min = Number(setting("DREAMATIC_SOURCE_MIN_TEXT_CHARS"));
  if (html) {
    const dom = new JSDOM(response.text, { url: response.url, virtualConsole: new VirtualConsole() });
    try {
      // JSDOM scripts and remote resources remain disabled. Readability is extraction, not a browser.
      const article = new Readability(dom.window.document, { charThreshold: min, maxElemsToParse: 20000 }).parse();
      if (article?.content && (article.textContent?.trim().length || 0) >= min) {
        body = article.content; title = article.title || title; date = article.publishedTime || date;
      }
    } catch { /* Non-article tables and irregular pages use the semantic main/body fallback. */ }
    finally { dom.window.close(); }
    const content = load(body);
    content("script,style,iframe,object,embed,form,input,button,nav,footer,noscript,[aria-hidden='true']").remove();
    content("a[href]").each((_i, el) => {
      try { const url = new URL(content(el).attr("href")!, response.url); if (!["https:", "http:"].includes(url.protocol)) content(el).removeAttr("href"); else content(el).attr("href", url.href); }
      catch { content(el).removeAttr("href"); }
    });
    content("img").each((_i, el) => { content(el).replaceWith(content(el).attr("alt") || ""); });
    body = content("body").html() || "";
  }
  const text = html ? load(body)("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim() : response.text.trim();
  const denied = (response.status ?? 200) >= 400 || /^(?:403\b|401\b|429\b|404\b|503\b|forbidden$|access denied$)/i.test(title);
  const cookies = /cookies must be enabled|enable cookies for|cookies (?:are )?(?:required|disabled|not supported)|请启用.*cookie/i.test(title + " " + text.slice(0, 350));
  const challenge = /checking (?:your )?browser|just a moment|access denied|verify (?:you are|that you)|security check|^sign in$|^log in$|人机验证|安全验证|访问被拒绝|请先登录/i.test(title)
    || (text.length < min * 4 && /checking (?:your )?browser|verify (?:you are|that you)|enable javascript and cookies|complete the captcha|验证您是人类|请完成验证|请先登录/i.test(text.slice(0, 350)));
  const paywall = text.length < min * 8 && /subscribe to (?:read|continue)|subscription required|请订阅后|订阅后阅读|付费后阅读/i.test(text.slice(0, 350));
  let structured = false, dataError = false;
  if (/json/i.test(response.contentType)) try {
    const data = JSON.parse(text); structured = data !== null && typeof data === "object" && Object.keys(data).length > 0;
    dataError = structured && !Array.isArray(data) && Object.keys(data).every(key => ["error", "message", "detail", "status", "code"].includes(key)) && /error|unauthor|forbidden|denied|captcha|rate.?limit|login|错误|失败/i.test(text);
  } catch { dataError = true; }
  if (/csv|xml/i.test(response.contentType)) structured = text.length > 20 && text.split("\n").length > 1;
  const reason = denied ? `站点${challenge ? "返回安全验证页" : "拒绝访问或响应错误"}（HTTP ${response.status ?? "未知"}），未取得文章正文` : cookies ? "站点要求启用 Cookie，尚未取得有效正文" : challenge || paywall ? "页面是浏览器验证、验证码、登录或访问限制页，未取得有效正文" : dataError ? "来源返回错误或无法解析的数据响应，未取得有效数据" : !text ? "来源没有可读取正文" : !structured && text.length < min ? `提取正文过短（${text.length} 字符，阈值 ${min}），需要其他来源或人工提供资料` : "正文已提取，资料内容及统计口径仍需核实";
  let markdown = text;
  if (html && body) {
    const converter = new Turndown({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
    converter.use(gfm);
    markdown = converter.turndown(body);
  }
  return { title, text, markdown, published_at: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 100) : null, quality: { status: denied || cookies || challenge || paywall || dataError || !text || (!structured && text.length < min) ? "rejected" as const : "accepted" as const, reason } };
}

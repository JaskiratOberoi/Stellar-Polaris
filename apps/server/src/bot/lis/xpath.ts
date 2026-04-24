import type { ElementHandle, Page } from 'puppeteer';

export const delayMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Puppeteer 22 dropped `Page.$x`. Use the modern XPath query selector prefix
 * (`xpath/<expression>`), with an `evaluateHandle` fallback for older builds.
 */
export async function queryByXPath(page: Page, expression: string): Promise<ElementHandle<Element>[]> {
  try {
    const handles = await page.$$(`xpath/${expression}`);
    return handles as unknown as ElementHandle<Element>[];
  } catch {
    /* fall through to evaluateHandle path */
  }
  const arrayHandle = await page.evaluateHandle((xp) => {
    const out: Element[] = [];
    const it = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    let node = it.iterateNext();
    while (node) {
      if (node.nodeType === 1) out.push(node as Element);
      node = it.iterateNext();
    }
    return out;
  }, expression);
  const props = await arrayHandle.getProperties();
  await arrayHandle.dispose();
  const handles: ElementHandle<Element>[] = [];
  for (const prop of props.values()) {
    const el = prop.asElement();
    if (el) handles.push(el as ElementHandle<Element>);
    else await prop.dispose();
  }
  return handles;
}

export function escapeXPathText(value: unknown): string {
  const text = String(value ?? '');
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  const parts = text.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(`, "'" , `)})`;
}

export async function waitForElement(
  page: Page,
  xpaths: string[],
  timeout = 10000
): Promise<ElementHandle<Element>> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    for (const xpath of xpaths) {
      const handles = await queryByXPath(page, xpath);
      if (handles && handles.length > 0) {
        for (let i = 1; i < handles.length; i++) {
          void handles[i].dispose();
        }
        return handles[0];
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Element not found for XPaths: ${xpaths.join(' | ')}`);
}

export async function clickElement(
  page: Page,
  xpaths: string[],
  options: { retries?: number; waitTimeout?: number } = {}
): Promise<void> {
  const retries = Number(options.retries ?? 3);
  const waitTimeout = Number(options.waitTimeout ?? 8000);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const handle = await waitForElement(page, xpaths, waitTimeout);
      await page.evaluate((el) => el?.scrollIntoView({ block: 'center', inline: 'center' }), handle);
      await new Promise((r) => setTimeout(r, 80));
      try {
        await handle.click({ delay: 40 });
      } catch {
        await page.evaluate((el) => {
          if (!el) return;
          el.removeAttribute('disabled');
          el.removeAttribute('readonly');
          if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }, handle);
      }
      return;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw lastError || new Error('clickElement failed');
}

export async function typeElement(page: Page, xpaths: string[], value: string | number): Promise<void> {
  const handle = await waitForElement(page, xpaths, 8000);
  await handle.click({ clickCount: 3, delay: 25 });
  await page.keyboard.press('Backspace');
  await handle.type(String(value ?? ''), { delay: 15 });
}

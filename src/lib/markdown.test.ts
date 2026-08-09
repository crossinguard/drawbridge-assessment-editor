// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown, summarise } from './markdown';

/*
  jsdom, because DOMPurify needs a DOM. This is the one place in the suite that does —
  everything else is headless on purpose.

  The threat model is not the local author. It is IMPORT: a bundle is a plain zip that
  can arrive from a colleague, an email, or an old backup, and its stems go straight
  into `{@html}` when a collection is opened.
*/

describe('renderMarkdown', () => {
  it('renders the things a question stem actually uses', () => {
    const html = renderMarkdown('A **median** of `5`\n\n- one\n- two');
    expect(html).toContain('<strong>median</strong>');
    expect(html).toContain('<code>5</code>');
    expect(html).toContain('<li>one</li>');
  });

  it('renders tables, which is why preview exists at all', () => {
    const html = renderMarkdown('| Shift | Patients |\n| --- | --- |\n| 1 | 24 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>24</td>');
  });

  it('treats a single newline as a line break', () => {
    // An author who pressed Enter between two lines of data meant it.
    expect(renderMarkdown('24\n28')).toContain('<br>');
  });

  it('strips a script tag', () => {
    const html = renderMarkdown('Before <script>alert(1)</script> after');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips inline event handlers', () => {
    const html = renderMarkdown('<div onclick="steal()">Click</div>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('steal()');
  });

  it('drops a javascript: link but keeps its text', () => {
    const html = renderMarkdown('[tap here](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('tap here');
  });

  it('keeps ordinary links', () => {
    expect(renderMarkdown('[docs](https://example.org)')).toContain('href="https://example.org"');
  });

  it('strips img, so a stem cannot make a network request', () => {
    // The app promises to make no network calls. A remote image in an imported bundle
    // would break that promise and leak the fact that the file was opened.
    const html = renderMarkdown('![x](https://tracker.example/pixel.gif)');
    expect(html).not.toContain('<img');
  });

  it('strips iframe and object', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe><object></object>');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<object');
  });

  it('survives an svg-based payload', () => {
    const html = renderMarkdown('<svg><script>alert(1)</script></svg>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<svg');
  });

  it('returns nothing for empty or whitespace input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   \n  ')).toBe('');
  });
});

describe('summarise', () => {
  it('flattens markdown to a single readable line', () => {
    expect(summarise('## Median of five shifts\n\nWhat is the **median**?')).toBe(
      'Median of five shifts What is the median?'
    );
  });

  it('keeps link text and drops the target', () => {
    expect(summarise('See [the table](https://example.org/x)')).toBe('See the table');
  });

  it('does not leave a gap where emphasis was', () => {
    expect(summarise('What is the **median**?')).toBe('What is the median?');
  });

  it('does not eat a hyphen inside a word', () => {
    // A blanket character class turns "well-known" into "well known" because it
    // cannot tell a list bullet from a hyphen.
    expect(summarise('A well-known non-parametric test')).toBe(
      'A well-known non-parametric test'
    );
  });

  it('strips list bullets at the start of a line', () => {
    expect(summarise('- one\n- two')).toBe('one two');
  });

  it('truncates long text with an ellipsis', () => {
    const summary = summarise('word '.repeat(60), 30);
    expect(summary.length).toBeLessThanOrEqual(30);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('leaves short text alone', () => {
    expect(summarise('Short one')).toBe('Short one');
  });
});

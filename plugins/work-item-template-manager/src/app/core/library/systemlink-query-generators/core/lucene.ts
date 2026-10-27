/**
 * Lucene filter-string helpers for the SystemLink `materialized/search-*` endpoints
 * (Elasticsearch-backed). Syntax: `field:"value"`, `AND`/`OR`/`NOT`, `*` wildcards inside
 * quoted values, `_exists_:field`, and `[a TO b]` / `{a TO b}` ranges with `*` as no bound.
 * Field names and values are case-insensitive on those services.
 */

/** The boolean operator joining a token to the previous one. */
export type LuceneJunction = 'AND' | 'OR';

/** A top-level token of a Lucene expression and the operator that precedes it. */
export interface LuceneToken {
  text: string;
  /** `null` for the first token. */
  op: LuceneJunction | null;
}

/** Escapes a value for a double-quoted Lucene phrase, including the `*`/`?` wildcards. */
export function escapeLuceneString(value: string): string {
  return String(value).replace(/[\\"*?]/g, (char) => `\\${char}`);
}

/** Reverses {@link escapeLuceneString}. */
export function unescapeLuceneString(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

/** Renders a field name, quoting it when it holds characters Lucene would misread (spaces, `?`, `[`, ...). */
export function luceneField(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `"${name.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/** Renders a value literal: numbers/booleans bare, everything else as an escaped quoted phrase. */
export function luceneLiteral(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return `"${escapeLuceneString(value)}"`;
}

/** Renders a quoted wildcard phrase such as `"*value*"`, escaping the literal part. */
export function luceneWildcard(value: string, leading: boolean, trailing: boolean): string {
  return `"${leading ? '*' : ''}${escapeLuceneString(value)}${trailing ? '*' : ''}"`;
}

/**
 * Renders a one-sided range. `lower`/`upper` are already-rendered literals; omit one for no bound.
 * Inclusive bounds use `[`/`]`, exclusive bounds `{`/`}`.
 */
export function luceneRange(
  field: string,
  bound: { lower?: string; upper?: string; inclusive: boolean },
): string {
  const open = bound.lower !== undefined && !bound.inclusive ? '{' : '[';
  const close = bound.upper !== undefined && !bound.inclusive ? '}' : ']';
  return `${luceneField(field)}:${open}${bound.lower ?? '*'} TO ${bound.upper ?? '*'}${close}`;
}

/**
 * Splits an expression into top-level tokens on `AND`/`OR` (and `&&`/`||`), ignoring
 * operators inside quotes, parentheses, or range brackets.
 */
export function splitLuceneTopLevel(expression: string): LuceneToken[] {
  const tokens: LuceneToken[] = [];
  let depth = 0;
  let inQuote = false;
  let current = '';
  let pendingOp: LuceneJunction | null = null;

  function push(): void {
    if (current.trim().length > 0) {
      tokens.push({ text: current.trim(), op: tokens.length === 0 ? null : pendingOp });
    }
    current = '';
  }

  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];

    if (inQuote) {
      current += char;
      if (char === '\\') {
        current += expression[i + 1] ?? '';
        i += 1;
      } else if (char === '"') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
    } else if (char === '(' || char === '[' || char === '{') {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      if ((char === '&' || char === '|') && expression[i + 1] === char) {
        push();
        pendingOp = char === '&' ? 'AND' : 'OR';
        i += 1;
        continue;
      }
      if (/\s/.test(char)) {
        const wordOp = /^\s+(AND|OR)\s+/.exec(expression.slice(i));
        if (wordOp) {
          push();
          pendingOp = wordOp[1] as LuceneJunction;
          i += wordOp[0].length - 1;
          continue;
        }
      }
    }

    current += char;
  }
  push();

  return tokens;
}

/** Removes balanced parentheses that wrap the whole expression. */
export function stripLuceneParentheses(expression: string): string {
  let result = expression.trim();
  while (result.startsWith('(') && result.endsWith(')')) {
    let depth = 0;
    let inQuote = false;
    let wrapsWhole = true;
    for (let i = 0; i < result.length; i += 1) {
      const char = result[i];
      if (inQuote) {
        if (char === '\\') {
          i += 1;
        } else if (char === '"') {
          inQuote = false;
        }
        continue;
      }
      if (char === '"') {
        inQuote = true;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0 && i < result.length - 1) {
          wrapsWhole = false;
          break;
        }
      }
    }
    if (!wrapsWhole) {
      break;
    }
    result = result.slice(1, -1).trim();
  }
  return result;
}

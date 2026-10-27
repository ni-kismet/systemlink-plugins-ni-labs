import { IDynamicFormTemplateContext } from '../../models/dynamic-form-fields.models';

/**
 * Evaluates a Dynamic Form Fields configuration `displayRule` against a template context.
 *
 * Supported grammar (a safe subset of the SystemLink rule syntax, evaluated without `eval`):
 *   expression := or
 *   or         := and ('||' and)*
 *   and        := unary ('&&' unary)*
 *   unary      := '!' unary | comparison
 *   comparison := postfix (('=='|'!='|'in') postfix)?
 *   postfix    := primary ('.' method '(' args? ')')*
 *   primary    := '(' expression ')' | string | number | bool | path
 *   path       := ident ('.' ident | '[' string ']')*
 *
 * Recognized paths: name, type, templateId, workspace, product.family, product,
 * properties['key'] / properties["key"]. Unknown paths resolve to undefined.
 * On any parse/eval error the rule is treated as non-matching (fail closed).
 */
export function evaluateDisplayRule(rule: string, context: IDynamicFormTemplateContext): boolean {
  try {
    const parser = new RuleParser(rule, context);
    const result = parser.parse();
    return toBoolean(result);
  } catch {
    return false;
  }
}

type RuleValue = string | number | boolean | string[] | undefined;

interface IToken {
  type: 'string' | 'number' | 'identifier' | 'operator' | 'punct';
  value: string;
}

const TWO_CHAR_OPERATORS = new Set(['==', '!=', '&&', '||']);

class RuleParser {
  private readonly tokens: IToken[];
  private position = 0;

  public constructor(
    rule: string,
    private readonly context?: IDynamicFormTemplateContext,
  ) {
    this.tokens = tokenize(rule);
  }

  public parse(): RuleValue {
    const value = this.parseOr();
    if (this.position < this.tokens.length) {
      throw new Error('Unexpected trailing tokens');
    }
    return value;
  }

  private parseOr(): RuleValue {
    let left = this.parseAnd();
    while (this.matchOperator('||')) {
      const right = this.parseAnd();
      left = toBoolean(left) || toBoolean(right);
    }
    return left;
  }

  private parseAnd(): RuleValue {
    let left = this.parseUnary();
    while (this.matchOperator('&&')) {
      const right = this.parseUnary();
      left = toBoolean(left) && toBoolean(right);
    }
    return left;
  }

  private parseUnary(): RuleValue {
    if (this.matchOperator('!')) {
      return !toBoolean(this.parseUnary());
    }
    return this.parseComparison();
  }

  private parseComparison(): RuleValue {
    const left = this.parsePostfix();

    if (this.matchOperator('==')) {
      return looseEquals(left, this.parsePostfix());
    }
    if (this.matchOperator('!=')) {
      return !looseEquals(left, this.parsePostfix());
    }
    if (this.matchKeyword('in')) {
      return isIn(left, this.parsePostfix());
    }

    return left;
  }

  private parsePostfix(): RuleValue {
    let value = this.parsePrimary();

    while (this.matchPunct('.')) {
      const method = this.expectIdentifier();
      this.expectPunct('(');
      const args: RuleValue[] = [];
      if (!this.checkPunct(')')) {
        args.push(this.parseOr());
        while (this.matchPunct(',')) {
          args.push(this.parseOr());
        }
      }
      this.expectPunct(')');
      value = applyMethod(value, method, args);
    }

    return value;
  }

  private parsePrimary(): RuleValue {
    if (this.matchPunct('(')) {
      const value = this.parseOr();
      this.expectPunct(')');
      return value;
    }

    const token = this.peek();
    if (!token) {
      throw new Error('Unexpected end of rule');
    }

    if (token.type === 'string') {
      this.position += 1;
      return token.value;
    }

    if (token.type === 'number') {
      this.position += 1;
      return Number(token.value);
    }

    if (token.type === 'identifier') {
      if (token.value === 'true' || token.value === 'false') {
        this.position += 1;
        return token.value === 'true';
      }
      return this.parsePath();
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  private parsePath(): RuleValue {
    const segments: string[] = [this.expectIdentifier()];

    for (;;) {
      if (this.checkPunct('.')) {
        // Do not consume a method call here; only property access via identifier.
        const next = this.tokens[this.position + 1];
        const afterNext = this.tokens[this.position + 2];
        const isMethodCall = next?.type === 'identifier' && afterNext?.value === '(';
        if (isMethodCall) {
          break;
        }
        this.position += 1;
        segments.push(this.expectIdentifier());
        continue;
      }

      if (this.matchPunct('[')) {
        const keyToken = this.peek();
        if (keyToken?.type !== 'string') {
          throw new Error('Expected string index');
        }
        this.position += 1;
        this.expectPunct(']');
        segments.push(`[${keyToken.value}]`);
        continue;
      }

      break;
    }

    return this.resolvePath(segments);
  }

  private resolvePath(segments: string[]): RuleValue {
    const context = this.context;
    if (!context) {
      return undefined;
    }

    const root = segments[0];

    if (root === 'name') {
      return context.name ?? '';
    }
    if (root === 'type') {
      return context.type ?? '';
    }
    if (root === 'templateId') {
      return context.templateId;
    }
    if (root === 'workspace') {
      return context.workspaceId ?? '';
    }
    if (root === 'product') {
      // product.family -> productFamilies array; bare product -> partNumbers array.
      if (segments[1] === 'family') {
        return context.productFamilies ?? [];
      }
      return context.partNumbers ?? [];
    }
    if (root === 'properties') {
      const keySegment = segments[1] ?? '';
      const match = keySegment.match(/^\[(.*)\]$/);
      const key = match ? match[1] : keySegment;
      const value = context.properties?.[key];
      return normalizeContextValue(value);
    }

    return undefined;
  }

  private peek(): IToken | undefined {
    return this.tokens[this.position];
  }

  private matchOperator(value: string): boolean {
    const token = this.peek();
    if (token && token.type === 'operator' && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private matchKeyword(value: string): boolean {
    const token = this.peek();
    if (token && token.type === 'identifier' && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private matchPunct(value: string): boolean {
    if (this.checkPunct(value)) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private checkPunct(value: string): boolean {
    const token = this.peek();
    return !!token && token.type === 'punct' && token.value === value;
  }

  private expectPunct(value: string): void {
    if (!this.matchPunct(value)) {
      throw new Error(`Expected '${value}'`);
    }
  }

  private expectIdentifier(): string {
    const token = this.peek();
    if (token?.type !== 'identifier') {
      throw new Error('Expected identifier');
    }
    this.position += 1;
    return token.value;
  }
}

function tokenize(rule: string): IToken[] {
  const tokens: IToken[] = [];
  let index = 0;

  while (index < rule.length) {
    const char = rule[index];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      index += 1;
      while (index < rule.length && rule[index] !== quote) {
        if (rule[index] === '\\' && index + 1 < rule.length) {
          value += rule[index + 1];
          index += 2;
          continue;
        }
        value += rule[index];
        index += 1;
      }
      index += 1; // closing quote
      tokens.push({ type: 'string', value });
      continue;
    }

    if (isDigit(char)) {
      let value = '';
      while (index < rule.length && (isDigit(rule[index]) || rule[index] === '.')) {
        value += rule[index];
        index += 1;
      }
      tokens.push({ type: 'number', value });
      continue;
    }

    if (isIdentifierStart(char)) {
      let value = '';
      while (index < rule.length && isIdentifierPart(rule[index])) {
        value += rule[index];
        index += 1;
      }
      tokens.push({ type: 'identifier', value });
      continue;
    }

    const twoChar = rule.slice(index, index + 2);
    if (TWO_CHAR_OPERATORS.has(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar });
      index += 2;
      continue;
    }

    if (char === '!') {
      tokens.push({ type: 'operator', value: '!' });
      index += 1;
      continue;
    }

    if ('()[].,'.includes(char)) {
      tokens.push({ type: 'punct', value: char });
      index += 1;
      continue;
    }

    // Unknown character; skip to stay resilient.
    index += 1;
  }

  return tokens;
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function toBoolean(value: RuleValue): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}

function normalizeContextValue(value: unknown): RuleValue {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return String(value);
}

function looseEquals(left: RuleValue, right: RuleValue): boolean {
  if (Array.isArray(left)) {
    return left.some((entry) => looseEquals(entry, right));
  }
  if (Array.isArray(right)) {
    return right.some((entry) => looseEquals(left, entry));
  }
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return String(left) === String(right);
}

function isIn(needle: RuleValue, haystack: RuleValue): boolean {
  if (Array.isArray(haystack)) {
    return haystack.some((entry) => looseEquals(entry, needle));
  }
  if (typeof haystack === 'string') {
    return haystack.includes(String(needle ?? ''));
  }
  return false;
}

function applyMethod(target: RuleValue, method: string, args: RuleValue[]): RuleValue {
  const name = method.toLowerCase();

  if (name === 'tolower') {
    return String(target ?? '').toLowerCase();
  }
  if (name === 'toupper') {
    return String(target ?? '').toUpperCase();
  }
  if (name === 'contains') {
    const argument = String(args[0] ?? '');
    if (Array.isArray(target)) {
      return target.some((entry) => String(entry) === argument);
    }
    return String(target ?? '').includes(argument);
  }
  if (name === 'startswith') {
    return String(target ?? '').startsWith(String(args[0] ?? ''));
  }
  if (name === 'endswith') {
    return String(target ?? '').endsWith(String(args[0] ?? ''));
  }

  return undefined;
}

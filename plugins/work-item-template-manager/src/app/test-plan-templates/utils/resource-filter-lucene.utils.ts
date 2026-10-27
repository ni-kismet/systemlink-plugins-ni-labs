import {
  FilterDataType,
  FilterOperation,
  luceneField,
  luceneLiteral,
  luceneRange,
  luceneWildcard,
  splitLuceneTopLevel,
  stripLuceneParentheses,
  unescapeLuceneString,
} from '../../core/library/systemlink-query-generators';
import { FILTER_OPERATION_META } from '../../core/constants/filter-operations.constants';
import { createAssetFilterFields } from '../../core/services/asset/asset.service';
import { createSystemFilterFields } from '../../core/services/system/system.service';

/** Which search index a resource filter targets: systems, or assets (DUTs, fixtures, assets). */
export type ResourceFilterKind = 'systems' | 'assets';

/** One query-builder row. `property` is the field-catalog path (the LINQ data field). */
export interface IResourceFilterCondition {
  property: string;
  propertyName?: string;
  /** Operator joining this condition to the previous one in its group (unused for the first row). */
  logicalOperator: 'AND' | 'OR';
  operator: string;
  value: string;
}

/** A query-builder group of rows. */
export interface IResourceFilterGroup {
  /** Operator joining this group to the previous one (unused for the first group). */
  logicalOperator: 'AND' | 'OR';
  conditions: IResourceFilterCondition[];
}

type ConditionRow = Omit<IResourceFilterCondition, 'logicalOperator'>;

// Catalog path -> search-systems field. Location, packages, and properties are handled separately.
const SYSTEM_FIELDS: Record<string, string> = {
  id: 'id',
  alias: 'alias',
  workspace: 'workspace',
  'connected.data.state': 'connected',
  'status.data.http_connected.ToString()': 'httpConnected',
  'keywords.data': 'keywords',
  'string(grains.data.computer_desc)': 'minionDetails.description',
  'string(grains.data.localhost)': 'minionDetails.localhost',
  'grains.data.minion_blackout.ToString()': 'minionDetails.locked',
  'string(grains.data.productname)': 'minionDetails.model',
  'string(grains.data.os_family)': 'minionDetails.osFamily',
  'string(grains.data.osrelease)': 'minionDetails.osRelease',
  'grains.data.is_superuser_password_set.ToString()': 'minionDetails.secured',
  'string(grains.data.serialnumber)': 'minionDetails.serialNumber',
  'grains.data.boottime': 'minionDetails.systemStartTime',
  'string(grains.data.system_tag)': 'minionDetails.systemTag',
  'string(grains.data.nisystemlink_version)': 'minionDetails.version',
  'string(grains.data.manufacturer)': 'minionDetails.vendor',
};

// Catalog path -> search-assets field. Location and Properties are handled separately.
const ASSET_FIELDS: Record<string, string> = {
  AssetIdentifier: 'AssetIdentifier',
  AssetName: 'Name',
  AssetType: 'AssetType',
  BusType: 'BusType',
  CalibrationStatus: 'CalibrationStatus',
  'ExternalCalibration.CalibrationDate': 'ExternalCalibration.CalibrationDate',
  'ExternalCalibration.NextRecommendedDate': 'ExternalCalibration.NextRecommendedDate',
  FirmwareVersion: 'FirmwareVersion',
  HardwareVersion: 'HardwareVersion',
  IsNIAsset: 'IsNIAsset',
  Keywords: 'Keywords',
  'Location.AssetState.AssetPresence': 'Location.AssetState.AssetPresence',
  'Location.AssetState.SystemConnection': 'Location.AssetState.SystemConnection',
  'Location.SlotNumber': 'Location.SlotNumber',
  ModelName: 'ModelName',
  ModelNumber: 'ModelNumber',
  PartNumber: 'PartNumber',
  'SelfCalibration.CalibrationDate': 'SelfCalibration.CalibrationDate',
  SerialNumber: 'SerialNumber',
  SupportsAnyCalibration: 'SupportsAnyCalibration',
  SupportsExternalCalibration: 'SupportsExternalCalibration',
  SupportsReset: 'SupportsReset',
  SupportsSelfCalibration: 'SupportsSelfCalibration',
  SupportsSelfTest: 'SupportsSelfTest',
  VendorName: 'VendorName',
  VendorNumber: 'VendorNumber',
  VisaResourceName: 'VisaResourceName',
  workspace: 'Workspace',
};

const FIELDS: Record<ResourceFilterKind, Record<string, string>> = { systems: SYSTEM_FIELDS, assets: ASSET_FIELDS };

// Systems booleans are modeled as true/false enums in the catalog but indexed as booleans.
const BOOLEAN_FIELDS = new Set(['httpConnected', 'minionDetails.locked', 'minionDetails.secured']);

const PROPERTY_PATH: Record<ResourceFilterKind, string> = { systems: 'properties.data', assets: 'Properties' };
const PROPERTY_PREFIX: Record<ResourceFilterKind, string> = { systems: 'properties.', assets: 'Properties.' };

const SYSTEM_LOCATION_PATH = 'locationId';
const ASSET_LOCATION_PATH = 'Location';
const PACKAGE_PATH = 'packages.data';
const PACKAGE_VERSION_PATH = 'packages';

const fieldTypes: Partial<Record<ResourceFilterKind, Map<string, FilterDataType>>> = {};

/** Data type of a catalog path, from the static field catalog (String when unknown). */
function dataTypeOf(kind: ResourceFilterKind, path: string): FilterDataType {
  let types = fieldTypes[kind];
  if (!types) {
    const fields = kind === 'systems' ? createSystemFilterFields() : createAssetFilterFields();
    types = new Map(fields.map((field) => [field.dataField, field.type]));
    fieldTypes[kind] = types;
  }
  return types.get(path) ?? FilterDataType.String;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Renders one query-builder row to a Lucene clause, or null when it is incomplete or (in strict
 * mode) uses a field with no known search-index equivalent.
 */
export function conditionToLucene(
  condition: ConditionRow,
  kind: ResourceFilterKind,
  strict = false,
): string | null {
  const path = condition.property.trim();
  const operation = condition.operator as FilterOperation;
  const value = condition.value.trim();
  const key = (condition.propertyName ?? '').trim();
  const meta = FILTER_OPERATION_META[operation];
  if (!path || !meta || (meta.needsValue && !value)) {
    return null;
  }

  if (kind === 'systems' && path === SYSTEM_LOCATION_PATH) {
    return systemLocationToLucene(operation, value);
  }
  if (kind === 'assets' && path === ASSET_LOCATION_PATH) {
    return assetLocationToLucene(operation, value);
  }
  if (kind === 'systems' && path === PACKAGE_PATH) {
    return packageToLucene(operation, key);
  }
  if (kind === 'systems' && path === PACKAGE_VERSION_PATH) {
    return packageVersionToLucene(operation, key, value);
  }
  if (path === PROPERTY_PATH[kind]) {
    return key ? propertyToLucene(`${PROPERTY_PREFIX[kind]}${key}`, operation, value) : null;
  }

  const field = FIELDS[kind][path] ?? (!strict && /^[A-Za-z_][\w.]*$/.test(path) ? path : undefined);
  if (!field) {
    return null;
  }
  return fieldToLucene(field, dataTypeOf(kind, path), operation, value);
}

/** Renders a value for its field type: numbers and booleans bare, everything else quoted. */
function typedLiteral(field: string, dataType: FilterDataType, value: string): string {
  if (dataType === FilterDataType.Number && value !== '' && Number.isFinite(Number(value))) {
    return luceneLiteral(Number(value));
  }
  if (dataType === FilterDataType.Boolean || BOOLEAN_FIELDS.has(field)) {
    return luceneLiteral(value.toLowerCase() === 'true');
  }
  return luceneLiteral(value);
}

function fieldToLucene(field: string, dataType: FilterDataType, operation: FilterOperation, value: string): string | null {
  const name = luceneField(field);
  const literal = typedLiteral(field, dataType, value);
  switch (operation) {
    case FilterOperation.Equals:
      return `${name}:${literal}`;
    case FilterOperation.NotEquals:
      return `NOT ${name}:${literal}`;
    case FilterOperation.Contains:
    case FilterOperation.ListContains:
      return `${name}:${luceneWildcard(value, true, true)}`;
    case FilterOperation.NotContains:
    case FilterOperation.ListNotContains:
      return `NOT ${name}:${luceneWildcard(value, true, true)}`;
    case FilterOperation.StartsWith:
      return `${name}:${luceneWildcard(value, false, true)}`;
    case FilterOperation.EndsWith:
      return `${name}:${luceneWildcard(value, true, false)}`;
    // Blank covers both a missing field and an empty string, like string.IsNullOrEmpty.
    case FilterOperation.IsEmpty:
      return `(NOT _exists_:${name} OR ${name}:"")`;
    case FilterOperation.IsNotEmpty:
      return `(_exists_:${name} AND NOT ${name}:"")`;
    case FilterOperation.GreaterThan:
    case FilterOperation.IsAfter:
      return luceneRange(field, { lower: literal, inclusive: false });
    case FilterOperation.GreaterThanOrEqual:
    case FilterOperation.IsOnOrAfter:
      return luceneRange(field, { lower: literal, inclusive: true });
    case FilterOperation.LessThan:
    case FilterOperation.IsBefore:
      return luceneRange(field, { upper: literal, inclusive: false });
    case FilterOperation.LessThanOrEqual:
    case FilterOperation.IsOnOrBefore:
      return luceneRange(field, { upper: literal, inclusive: true });
    default:
      return null;
  }
}

/** Key/value property clauses. Negations also match items without the key, as LINQ does. */
function propertyToLucene(fieldName: string, operation: FilterOperation, value: string): string | null {
  const field = luceneField(fieldName);
  switch (operation) {
    case FilterOperation.KeyValueMatches:
      return `${field}:${luceneLiteral(value)}`;
    case FilterOperation.KeyValueNotMatches:
      return `(NOT _exists_:${field} OR NOT ${field}:${luceneLiteral(value)})`;
    case FilterOperation.KeyValueContains:
      return `${field}:${luceneWildcard(value, true, true)}`;
    case FilterOperation.KeyValueNotContains:
      return `(NOT _exists_:${field} OR NOT ${field}:${luceneWildcard(value, true, true)})`;
    case FilterOperation.ContainsKey:
      return `_exists_:${field}`;
    case FilterOperation.NotContainsKey:
      return `NOT _exists_:${field}`;
    default:
      return null;
  }
}

function systemLocationToLucene(operation: FilterOperation, value: string): string | null {
  switch (operation) {
    case FilterOperation.Equals:
      return `locationId:${luceneLiteral(value)}`;
    case FilterOperation.NotEquals:
      return `NOT locationId:${luceneLiteral(value)}`;
    case FilterOperation.IsEmpty:
      return 'location.blank:true';
    case FilterOperation.IsNotEmpty:
      return 'location.blank:false';
    default:
      return null;
  }
}

/** SystemLink's asset Location matches either the parent system or the physical location. */
function assetLocationToLucene(operation: FilterOperation, value: string): string | null {
  const literal = luceneLiteral(value);
  switch (operation) {
    case FilterOperation.Equals:
      return `(Location.MinionId:${literal} OR Location.PhysicalLocation:${literal})`;
    case FilterOperation.NotEquals:
      return `(NOT Location.MinionId:${literal} AND NOT Location.PhysicalLocation:${literal})`;
    case FilterOperation.IsEmpty:
      return '(NOT _exists_:Location.MinionId AND NOT _exists_:Location.PhysicalLocation)';
    case FilterOperation.IsNotEmpty:
      return '(_exists_:Location.MinionId OR _exists_:Location.PhysicalLocation)';
    default:
      return null;
  }
}

function packageToLucene(operation: FilterOperation, name: string): string | null {
  if (!name) {
    return null;
  }
  switch (operation) {
    case FilterOperation.ContainsKey:
      return `packages.name:${luceneLiteral(name)}`;
    case FilterOperation.NotContainsKey:
      return `NOT packages.name:${luceneLiteral(name)}`;
    default:
      return null;
  }
}

function packageVersionToLucene(operation: FilterOperation, name: string, version: string): string | null {
  if (!name || !version) {
    return null;
  }
  const fieldName = `packages.${name}.version`;
  const field = luceneField(fieldName);
  const literal = luceneLiteral(version);
  switch (operation) {
    case FilterOperation.KeyValueMatches:
      return `${field}:${literal}`;
    case FilterOperation.KeyValueNotMatches:
      return `(packages.name:${luceneLiteral(name)} AND NOT ${field}:${literal})`;
    case FilterOperation.GreaterThan:
      return luceneRange(fieldName, { lower: literal, inclusive: false });
    case FilterOperation.GreaterThanOrEqual:
      return luceneRange(fieldName, { lower: literal, inclusive: true });
    case FilterOperation.LessThan:
      return luceneRange(fieldName, { upper: literal, inclusive: false });
    case FilterOperation.LessThanOrEqual:
      return luceneRange(fieldName, { upper: literal, inclusive: true });
    default:
      return null;
  }
}

/** Joins parts by their operators; mixed AND/OR is grouped so AND binds tighter, matching LINQ. */
function joinLucene(parts: { text: string; op: 'AND' | 'OR' }[]): string {
  if (parts.length === 0) {
    return '';
  }
  const junctions = parts.slice(1).map((part) => part.op);
  if (junctions.every((op) => op === junctions[0])) {
    return parts.map((part) => part.text).join(` ${junctions[0] ?? 'AND'} `);
  }

  const chains: string[][] = [[parts[0].text]];
  for (const part of parts.slice(1)) {
    if (part.op === 'OR') {
      chains.push([part.text]);
    } else {
      chains[chains.length - 1].push(part.text);
    }
  }
  return chains.map((chain) => (chain.length > 1 ? `(${chain.join(' AND ')})` : chain[0])).join(' OR ');
}

/**
 * Renders query-builder groups to one Lucene expression. Incomplete rows are skipped, unless
 * `strict` is set, in which case any unrenderable row makes the result null.
 */
export function groupsToLucene(
  groups: IResourceFilterGroup[],
  kind: ResourceFilterKind,
  strict = false,
): string | null {
  const groupParts: { text: string; op: 'AND' | 'OR'; multi: boolean }[] = [];
  for (const group of groups) {
    const rows: { text: string; op: 'AND' | 'OR' }[] = [];
    for (const condition of group.conditions) {
      const text = conditionToLucene(condition, kind, strict);
      if (text === null) {
        if (strict) {
          return null;
        }
        continue;
      }
      rows.push({ text, op: condition.logicalOperator });
    }
    if (rows.length > 0) {
      groupParts.push({ text: joinLucene(rows), op: group.logicalOperator, multi: rows.length > 1 });
    }
  }

  if (groupParts.length === 1) {
    return groupParts[0].text;
  }
  return joinLucene(groupParts.map((part) => ({ text: part.multi ? `(${part.text})` : part.text, op: part.op })));
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

const FIELD = String.raw`(?:"(?:[^"\\]|\\.)*"|[A-Za-z_][\w.\-]*)`;
const PHRASE = String.raw`"(?:[^"\\]|\\.)*"`;

const IS_EMPTY = new RegExp(String.raw`^NOT\s+_exists_\s*:\s*(${FIELD})\s+OR\s+(${FIELD})\s*:\s*""$`);
const IS_NOT_EMPTY = new RegExp(String.raw`^_exists_\s*:\s*(${FIELD})\s+AND\s+NOT\s+(${FIELD})\s*:\s*""$`);
const PROPERTY_NOT = new RegExp(
  String.raw`^NOT\s+_exists_\s*:\s*(${FIELD})\s+OR\s+NOT\s+(${FIELD})\s*:\s*(${PHRASE})$`,
);
const ASSET_LOCATION_EQUALS = new RegExp(
  String.raw`^Location\.MinionId\s*:\s*(${PHRASE})\s+OR\s+Location\.PhysicalLocation\s*:\s*(${PHRASE})$`,
  'i',
);
const ASSET_LOCATION_NOT_EQUALS = new RegExp(
  String.raw`^NOT\s+Location\.MinionId\s*:\s*(${PHRASE})\s+AND\s+NOT\s+Location\.PhysicalLocation\s*:\s*(${PHRASE})$`,
  'i',
);
const ASSET_LOCATION_BLANK =
  /^NOT\s+_exists_\s*:\s*Location\.MinionId\s+AND\s+NOT\s+_exists_\s*:\s*Location\.PhysicalLocation$/i;
const ASSET_LOCATION_NOT_BLANK =
  /^_exists_\s*:\s*Location\.MinionId\s+OR\s+_exists_\s*:\s*Location\.PhysicalLocation$/i;
const PACKAGE_NOT_MATCHES = new RegExp(
  String.raw`^packages\.name\s*:\s*(${PHRASE})\s+AND\s+NOT\s+(${FIELD})\s*:\s*(${PHRASE})$`,
  'i',
);
const PACKAGE_VERSION_FIELD = /^packages\.(.+)\.version$/i;
const RANGE = new RegExp(
  String.raw`^([\[{])\s*(\*|${PHRASE}|[^\s\]}]+)\s+TO\s+(\*|${PHRASE}|[^\s\]}]+)\s*([\]}])$`,
);

/** Removes surrounding quotes from a field or phrase and unescapes it. */
function unquote(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
    ? unescapeLuceneString(trimmed.slice(1, -1))
    : trimmed;
}

/** Splits a quoted phrase into its literal text and unescaped leading/trailing `*` wildcards. */
function splitWildcards(phrase: string): { text: string; leading: boolean; trailing: boolean } {
  let inner = phrase.trim().slice(1, -1);
  const leading = inner.startsWith('*');
  if (leading) {
    inner = inner.slice(1);
  }
  const trailingBackslashes = /(\\*)\*$/.exec(inner)?.[1].length ?? -1;
  const trailing = trailingBackslashes >= 0 && trailingBackslashes % 2 === 0;
  if (trailing) {
    inner = inner.slice(0, -1);
  }
  return { text: unescapeLuceneString(inner), leading, trailing };
}

function propertyKeyOf(kind: ResourceFilterKind, field: string): string | undefined {
  const prefix = PROPERTY_PREFIX[kind];
  return field.toLowerCase().startsWith(prefix.toLowerCase()) && field.length > prefix.length
    ? field.slice(prefix.length)
    : undefined;
}

/** Maps a search-index field back to its catalog path (case-insensitive). */
function pathOf(kind: ResourceFilterKind, field: string): string | undefined {
  const lower = field.toLowerCase();
  return Object.entries(FIELDS[kind]).find(([, luceneName]) => luceneName.toLowerCase() === lower)?.[0];
}

function row(property: string, operator: FilterOperation, value = '', propertyName?: string): ConditionRow {
  return { property, propertyName, operator, value };
}

function sameField(a: string, b: string): boolean {
  return unquote(a).toLowerCase() === unquote(b).toLowerCase();
}

/** Recognizes the multi-term clauses this module renders for one row (blank, negated property, Location, ...). */
function parseCompound(expression: string, kind: ResourceFilterKind): ConditionRow | null {
  const empty = IS_EMPTY.exec(expression) ?? IS_NOT_EMPTY.exec(expression);
  if (empty && sameField(empty[1], empty[2])) {
    const path = pathOf(kind, unquote(empty[1]));
    const operator = expression.startsWith('NOT') ? FilterOperation.IsEmpty : FilterOperation.IsNotEmpty;
    return path ? row(path, operator) : null;
  }

  const propertyNot = PROPERTY_NOT.exec(expression);
  if (propertyNot && sameField(propertyNot[1], propertyNot[2])) {
    const key = propertyKeyOf(kind, unquote(propertyNot[1]));
    if (!key) {
      return null;
    }
    const { text, leading, trailing } = splitWildcards(propertyNot[3]);
    return leading && trailing
      ? row(PROPERTY_PATH[kind], FilterOperation.KeyValueNotContains, text, key)
      : leading || trailing
        ? null
        : row(PROPERTY_PATH[kind], FilterOperation.KeyValueNotMatches, text, key);
  }

  if (kind === 'assets') {
    const equals = ASSET_LOCATION_EQUALS.exec(expression);
    if (equals && unquote(equals[1]) === unquote(equals[2])) {
      return row(ASSET_LOCATION_PATH, FilterOperation.Equals, unquote(equals[1]));
    }
    const notEquals = ASSET_LOCATION_NOT_EQUALS.exec(expression);
    if (notEquals && unquote(notEquals[1]) === unquote(notEquals[2])) {
      return row(ASSET_LOCATION_PATH, FilterOperation.NotEquals, unquote(notEquals[1]));
    }
    if (ASSET_LOCATION_BLANK.test(expression)) {
      return row(ASSET_LOCATION_PATH, FilterOperation.IsEmpty);
    }
    if (ASSET_LOCATION_NOT_BLANK.test(expression)) {
      return row(ASSET_LOCATION_PATH, FilterOperation.IsNotEmpty);
    }
  }

  if (kind === 'systems') {
    const packageNot = PACKAGE_NOT_MATCHES.exec(expression);
    const versionField = packageNot ? PACKAGE_VERSION_FIELD.exec(unquote(packageNot[2])) : null;
    if (packageNot && versionField && versionField[1] === unquote(packageNot[1])) {
      return row(PACKAGE_VERSION_PATH, FilterOperation.KeyValueNotMatches, unquote(packageNot[3]), versionField[1]);
    }
  }

  return null;
}

/** Splits `field:value`, where the field may be a quoted name. */
function splitFieldValue(body: string): { field: string; value: string } | null {
  const match = new RegExp(String.raw`^(${FIELD})\s*:\s*(.+)$`).exec(body);
  return match ? { field: unquote(match[1]), value: match[2].trim() } : null;
}

function rangeOperation(
  dataType: FilterDataType,
  lowerSet: boolean,
  inclusive: boolean,
): FilterOperation {
  const isDate = dataType === FilterDataType.DateTime;
  if (lowerSet) {
    return inclusive
      ? isDate ? FilterOperation.IsOnOrAfter : FilterOperation.GreaterThanOrEqual
      : isDate ? FilterOperation.IsAfter : FilterOperation.GreaterThan;
  }
  return inclusive
    ? isDate ? FilterOperation.IsOnOrBefore : FilterOperation.LessThanOrEqual
    : isDate ? FilterOperation.IsBefore : FilterOperation.LessThan;
}

/** Parses a one-sided range value into a comparison operation and bound. */
function parseRange(value: string, dataType: FilterDataType): { operator: FilterOperation; value: string } | null {
  const match = RANGE.exec(value);
  if (!match) {
    return null;
  }
  const [, open, lower, upper, close] = match;
  if ((lower === '*') === (upper === '*')) {
    return null;
  }
  const lowerSet = lower !== '*';
  const inclusive = lowerSet ? open === '[' : close === ']';
  return { operator: rangeOperation(dataType, lowerSet, inclusive), value: unquote(lowerSet ? lower : upper) };
}

function parseTerm(field: string, value: string, negated: boolean, kind: ResourceFilterKind): ConditionRow | null {
  if (kind === 'systems') {
    if (field.toLowerCase() === 'location.blank' && /^(true|false)$/i.test(value)) {
      const blank = (value.toLowerCase() === 'true') !== negated;
      return row(SYSTEM_LOCATION_PATH, blank ? FilterOperation.IsEmpty : FilterOperation.IsNotEmpty);
    }
    if (field.toLowerCase() === 'packages.name') {
      return row(PACKAGE_PATH, negated ? FilterOperation.NotContainsKey : FilterOperation.ContainsKey, '', unquote(value));
    }
    const versionField = PACKAGE_VERSION_FIELD.exec(field);
    if (versionField) {
      const range = parseRange(value, FilterDataType.Number);
      if (range) {
        return negated ? null : row(PACKAGE_VERSION_PATH, range.operator, range.value, versionField[1]);
      }
      return negated ? null : row(PACKAGE_VERSION_PATH, FilterOperation.KeyValueMatches, unquote(value), versionField[1]);
    }
  }

  const key = propertyKeyOf(kind, field);
  if (key) {
    if (!value.startsWith('"')) {
      return row(PROPERTY_PATH[kind], negated ? FilterOperation.KeyValueNotMatches : FilterOperation.KeyValueMatches, value, key);
    }
    const { text, leading, trailing } = splitWildcards(value);
    if (leading && trailing) {
      return row(PROPERTY_PATH[kind], negated ? FilterOperation.KeyValueNotContains : FilterOperation.KeyValueContains, text, key);
    }
    return leading || trailing
      ? null
      : row(PROPERTY_PATH[kind], negated ? FilterOperation.KeyValueNotMatches : FilterOperation.KeyValueMatches, text, key);
  }

  const path = (kind === 'systems' && field.toLowerCase() === 'locationid' ? SYSTEM_LOCATION_PATH : undefined) ??
    pathOf(kind, field);
  if (!path) {
    return null;
  }
  const dataType = dataTypeOf(kind, path);

  const range = parseRange(value, dataType);
  if (range) {
    return negated ? null : row(path, range.operator, range.value);
  }
  if (!value.startsWith('"')) {
    return /^[^\s()[\]{}"]+$/.test(value)
      ? row(path, negated ? FilterOperation.NotEquals : FilterOperation.Equals, value)
      : null;
  }

  const { text, leading, trailing } = splitWildcards(value);
  if (leading && trailing) {
    return row(path, negated ? FilterOperation.NotContains : FilterOperation.Contains, text);
  }
  if (dataType === FilterDataType.StringArray) {
    return null;
  }
  if (leading || trailing) {
    return negated ? null : row(path, trailing ? FilterOperation.StartsWith : FilterOperation.EndsWith, text);
  }
  return row(path, negated ? FilterOperation.NotEquals : FilterOperation.Equals, text);
}

/** Parses one top-level Lucene clause into a query-builder row, or null when unrecognized. */
export function parseLuceneClause(clause: string, kind: ResourceFilterKind): ConditionRow | null {
  const expression = stripLuceneParentheses(clause);
  const compound = parseCompound(expression, kind);
  if (compound) {
    return compound;
  }
  if (splitLuceneTopLevel(expression).length !== 1) {
    return null;
  }

  let body = expression;
  let negated = false;
  const not = /^NOT\s+/.exec(body);
  if (not) {
    negated = true;
    body = stripLuceneParentheses(body.slice(not[0].length));
    if (splitLuceneTopLevel(body).length !== 1) {
      return null;
    }
  }

  const exists = new RegExp(String.raw`^_exists_\s*:\s*(${FIELD})$`).exec(body);
  if (exists) {
    const field = unquote(exists[1]);
    const key = propertyKeyOf(kind, field);
    if (key) {
      return row(PROPERTY_PATH[kind], negated ? FilterOperation.NotContainsKey : FilterOperation.ContainsKey, '', key);
    }
    const path = pathOf(kind, field);
    return path ? row(path, negated ? FilterOperation.IsEmpty : FilterOperation.IsNotEmpty) : null;
  }

  const term = splitFieldValue(body);
  return term ? parseTerm(term.field, term.value, negated, kind) : null;
}

/**
 * Parses a Lucene filter into query-builder groups, mirroring the LINQ parser: parenthesized
 * top-level clauses become their own group, consecutive bare clauses share one group.
 * `complete` is false when any clause was not recognized; those clauses become placeholder rows.
 */
export function parseLuceneGroups(
  expression: string,
  kind: ResourceFilterKind,
): { groups: IResourceFilterGroup[]; complete: boolean } {
  const groups: IResourceFilterGroup[] = [];
  let complete = true;
  let bareGroup: IResourceFilterGroup | null = null;

  function toRow(text: string): ConditionRow {
    const parsed = parseLuceneClause(text, kind);
    if (parsed) {
      return parsed;
    }
    complete = false;
    return row(text, FilterOperation.Equals);
  }

  for (const token of splitLuceneTopLevel(expression.trim())) {
    const operator = token.op ?? 'AND';
    const stripped = stripLuceneParentheses(token.text);
    const isGroup =
      stripped !== token.text && splitLuceneTopLevel(stripped).length > 1 && !parseCompound(stripped, kind);

    if (isGroup) {
      bareGroup = null;
      groups.push({
        logicalOperator: operator,
        conditions: splitLuceneTopLevel(stripped).map((inner) => ({
          ...toRow(inner.text),
          logicalOperator: inner.op ?? 'AND',
        })),
      });
      continue;
    }

    const condition: IResourceFilterCondition = { ...toRow(token.text), logicalOperator: operator };
    if (bareGroup) {
      bareGroup.conditions.push(condition);
    } else {
      bareGroup = { logicalOperator: operator, conditions: [{ ...condition, logicalOperator: 'AND' }] };
      groups.push(bareGroup);
    }
  }

  return { groups, complete };
}

/**
 * Canonical form of a LINQ or Lucene expression for round-trip comparison: word operators become
 * `&&`/`||` and whitespace outside quotes is dropped.
 */
export function normalizeFilterExpression(expression: string): string {
  let result = '';
  let inQuote = false;
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    if (inQuote) {
      result += char;
      if (char === '\\') {
        result += expression[i + 1] ?? '';
        i += 1;
      } else if (char === '"') {
        inQuote = false;
      }
      continue;
    }
    if (char === '"') {
      inQuote = true;
      result += char;
      continue;
    }
    if (/\s/.test(char)) {
      const wordOp = /^\s+(and|or)\s+/i.exec(expression.slice(i));
      if (wordOp) {
        result += wordOp[1].toLowerCase() === 'and' ? '&&' : '||';
        i += wordOp[0].length - 1;
      }
      continue;
    }
    result += char;
  }
  return result;
}

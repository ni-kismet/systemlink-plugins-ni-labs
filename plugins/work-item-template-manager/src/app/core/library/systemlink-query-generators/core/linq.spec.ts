import {
  buildLinqFilter,
  combineFilters,
  conditionToLinq,
  DateStyle,
  escapeLinqString,
  Op,
} from './linq';

describe('linq', () => {
  describe('conditionToLinq', () => {
    it('given___a_string_equals___when_rendered___then_quotes_the_value', () => {
      const linq = conditionToLinq({ field: 'name', operation: Op.Equals, value: 'abc' });
      expect(linq).toBe('name = "abc"');
    });

    it('given___a_number_equals___when_rendered___then_emits_bare_number', () => {
      const linq = conditionToLinq({ field: 'size', operation: Op.Equals, value: 5 });
      expect(linq).toBe('size = 5');
    });

    it('given___contains___when_rendered___then_uses_Contains_method', () => {
      const linq = conditionToLinq({ field: 'name', operation: Op.Contains, value: 'x' });
      expect(linq).toBe('name.Contains("x")');
    });

    it('given___ends_with___when_rendered___then_uses_EndsWith_method', () => {
      const linq = conditionToLinq({ field: 'name', operation: Op.EndsWith, value: 'x' });
      expect(linq).toBe('name.EndsWith("x")');
    });

    it('given___is_empty___when_rendered___then_uses_IsNullOrEmpty', () => {
      const linq = conditionToLinq({ field: 'name', operation: Op.IsEmpty });
      expect(linq).toBe('string.IsNullOrEmpty(name)');
    });

    it('given___list_contains___when_rendered___then_uses_Contains_on_the_collection', () => {
      const linq = conditionToLinq({ field: 'keywords', operation: Op.ListContains, value: 'urgent' });
      expect(linq).toBe('keywords.Contains("urgent")');
    });

    it('given___is_after_with_compare_style___when_rendered___then_uses_plain_comparison', () => {
      const linq = conditionToLinq(
        { field: 'startedAt', operation: Op.IsAfter, value: '2026-01-01T00:00:00Z' },
        { dateStyle: DateStyle.Compare },
      );
      expect(linq).toBe('startedAt > "2026-01-01T00:00:00Z"');
    });

    it('given___is_after_with_parse_style___when_rendered___then_wraps_in_DateTime_parse', () => {
      const linq = conditionToLinq(
        { field: 'createdAt', operation: Op.IsAfter, value: '2026-01-01T00:00:00Z' },
        { dateStyle: DateStyle.Parse },
      );
      expect(linq).toBe('DateTime(createdAt) > DateTime.parse("2026-01-01T00:00:00Z")');
    });

    it('given___key_value_matches___when_rendered___then_indexes_the_property', () => {
      const linq = conditionToLinq({
        field: 'properties',
        operation: Op.KeyValueMatches,
        key: 'Location',
        value: 'Austin',
      });
      expect(linq).toBe('properties["Location"] = "Austin"');
    });

    it('given___contains_key___when_rendered___then_uses_ContainsKey', () => {
      const linq = conditionToLinq({
        field: 'properties',
        operation: Op.ContainsKey,
        key: 'Location',
      });
      expect(linq).toBe('properties.ContainsKey("Location")');
    });

    it('given___a_raw_condition___when_rendered___then_emits_it_verbatim', () => {
      const linq = conditionToLinq({ operation: Op.Raw, linq: 'custom == 1' });
      expect(linq).toBe('custom == 1');
    });

    it('given___a_key_value_op_without_a_key___when_rendered___then_returns_empty', () => {
      const linq = conditionToLinq({ field: 'properties', operation: Op.KeyValueMatches, value: 'x' });
      expect(linq).toBe('');
    });
  });

  describe('buildLinqFilter', () => {
    it('given___multiple_conditions___when_anded___then_joins_with_double_ampersand', () => {
      const linq = buildLinqFilter([
        { field: 'name', operation: Op.Contains, value: 'x' },
        { field: 'workspace', operation: Op.Equals, value: 'ws1' },
      ]);
      expect(linq).toBe('name.Contains("x") && workspace = "ws1"');
    });

    it('given___or_logic___when_built___then_joins_with_double_pipe', () => {
      const linq = buildLinqFilter(
        [
          { field: 'id', operation: Op.Equals, value: '1' },
          { field: 'id', operation: Op.Equals, value: '2' },
        ],
        'or',
      );
      expect(linq).toBe('id = "1" || id = "2"');
    });

    it('given___a_nested_group___when_built___then_parenthesizes_the_sub_expression', () => {
      const linq = buildLinqFilter([
        { field: 'type', operation: Op.Equals, value: 'DUT' },
        {
          group: [
            { field: 'state', operation: Op.Equals, value: 'A' },
            { field: 'state', operation: Op.Equals, value: 'B' },
          ],
          logic: 'or',
        },
      ]);
      expect(linq).toBe('type = "DUT" && (state = "A" || state = "B")');
    });
  });

  describe('combineFilters', () => {
    it('given___two_filters___when_combined___then_wraps_each_in_parentheses', () => {
      const linq = combineFilters(['a = "1"', 'b = "2"']);
      expect(linq).toBe('(a = "1") && (b = "2")');
    });

    it('given___empty_parts___when_combined___then_skips_them', () => {
      const linq = combineFilters(['a = "1"', '', null, undefined], 'or');
      expect(linq).toBe('(a = "1")');
    });
  });

  describe('escapeLinqString', () => {
    it('given___a_value_with_a_quote___when_escaped___then_backslash_escapes_it', () => {
      expect(escapeLinqString('a" || b')).toBe('a\\" || b');
    });
  });
});

import { FilterOperation } from '../../core/library/systemlink-query-generators';
import {
  conditionToLucene,
  groupsToLucene,
  IResourceFilterGroup,
  normalizeFilterExpression,
  parseLuceneGroups,
} from './resource-filter-lucene.utils';

const row = (property: string, operator: FilterOperation, value = '', propertyName?: string) => ({
  property,
  operator,
  value,
  propertyName,
  logicalOperator: 'AND' as const,
});

describe('resource-filter-lucene', () => {
  describe('conditionToLucene', () => {
    const systems: [ReturnType<typeof row>, string][] = [
      [row('alias', FilterOperation.Equals, 'PP Test System'), 'alias:"PP Test System"'],
      [row('alias', FilterOperation.NotEquals, 'x'), 'NOT alias:"x"'],
      [row('alias', FilterOperation.Contains, 'Test'), 'alias:"*Test*"'],
      [row('alias', FilterOperation.StartsWith, 'PP'), 'alias:"PP*"'],
      [row('alias', FilterOperation.EndsWith, 'System'), 'alias:"*System"'],
      [row('alias', FilterOperation.IsEmpty), '(NOT _exists_:alias OR alias:"")'],
      [row('alias', FilterOperation.IsNotEmpty), '(_exists_:alias AND NOT alias:"")'],
      [row('connected.data.state', FilterOperation.Equals, 'CONNECTED'), 'connected:"CONNECTED"'],
      [row('status.data.http_connected.ToString()', FilterOperation.Equals, 'true'), 'httpConnected:true'],
      [row('string(grains.data.localhost)', FilterOperation.Contains, 'DESKTOP'), 'minionDetails.localhost:"*DESKTOP*"'],
      [row('keywords.data', FilterOperation.NotContains, 'Aus'), 'NOT keywords:"*Aus*"'],
      [row('properties.data', FilterOperation.KeyValueMatches, 'admin', 'Owner'), 'properties.Owner:"admin"'],
      [
        row('properties.data', FilterOperation.KeyValueNotMatches, 'admin', 'Owner'),
        '(NOT _exists_:properties.Owner OR NOT properties.Owner:"admin")',
      ],
      [row('properties.data', FilterOperation.ContainsKey, '', 'tester balancer?'), '_exists_:"properties.tester balancer?"'],
      [row('locationId', FilterOperation.IsEmpty), 'location.blank:true'],
      [row('packages.data', FilterOperation.ContainsKey, '', 'ni-package-manager'), 'packages.name:"ni-package-manager"'],
      [
        row('packages', FilterOperation.GreaterThanOrEqual, '25', 'ni-package-manager'),
        '"packages.ni-package-manager.version":["25" TO *]',
      ],
      [
        row('packages', FilterOperation.KeyValueNotMatches, '25.5', 'ni-package-manager'),
        '(packages.name:"ni-package-manager" AND NOT "packages.ni-package-manager.version":"25.5")',
      ],
      [
        row('grains.data.boottime', FilterOperation.IsAfter, '2026-06-01T00:00:00Z'),
        'minionDetails.systemStartTime:{"2026-06-01T00:00:00Z" TO *]',
      ],
      [row('alias', FilterOperation.Contains, 'a*b"c'), 'alias:"*a\\*b\\"c*"'],
    ];

    systems.forEach(([condition, expected]) => {
      it(`given___system_${condition.property}_${condition.operator}___when_rendered___then_${expected}`, () => {
        expect(conditionToLucene(condition, 'systems')).toBe(expected);
      });
    });

    const assets: [ReturnType<typeof row>, string][] = [
      [row('AssetName', FilterOperation.Contains, 'DESKTOP'), 'Name:"*DESKTOP*"'],
      [row('workspace', FilterOperation.Equals, 'ws'), 'Workspace:"ws"'],
      [row('ModelNumber', FilterOperation.GreaterThan, '30000'), 'ModelNumber:{30000 TO *]'],
      [row('ModelNumber', FilterOperation.LessThanOrEqual, '30000'), 'ModelNumber:[* TO 30000]'],
      [row('IsNIAsset', FilterOperation.Equals, 'true'), 'IsNIAsset:true'],
      [
        row('Location', FilterOperation.Equals, 'sys-1'),
        '(Location.MinionId:"sys-1" OR Location.PhysicalLocation:"sys-1")',
      ],
      [
        row('Location', FilterOperation.IsEmpty),
        '(NOT _exists_:Location.MinionId AND NOT _exists_:Location.PhysicalLocation)',
      ],
      [row('Properties', FilterOperation.KeyValueContains, 'rack', 'SOHC [%]'), '"Properties.SOHC [%]":"*rack*"'],
    ];

    assets.forEach(([condition, expected]) => {
      it(`given___asset_${condition.property}_${condition.operator}___when_rendered___then_${expected}`, () => {
        expect(conditionToLucene(condition, 'assets')).toBe(expected);
      });
    });

    it('given___an_unmapped_linq_path___when_rendered_strictly___then_returns_null', () => {
      expect(conditionToLucene(row('string(grains.data.custom)', FilterOperation.Equals, 'x'), 'systems', true)).toBeNull();
    });
  });

  describe('groupsToLucene', () => {
    it('given___mixed_and_or_rows___when_rendered___then_and_binds_tighter', () => {
      const groups: IResourceFilterGroup[] = [
        {
          logicalOperator: 'AND',
          conditions: [
            row('alias', FilterOperation.Contains, 'a'),
            row('alias', FilterOperation.Contains, 'b'),
            { ...row('alias', FilterOperation.Contains, 'c'), logicalOperator: 'OR' },
          ],
        },
      ];
      expect(groupsToLucene(groups, 'systems')).toBe('(alias:"*a*" AND alias:"*b*") OR alias:"*c*"');
    });

    it('given___two_groups___when_rendered___then_parenthesizes_multi_row_groups', () => {
      const groups: IResourceFilterGroup[] = [
        {
          logicalOperator: 'AND',
          conditions: [
            row('alias', FilterOperation.Contains, 'Test'),
            { ...row('alias', FilterOperation.Contains, 'PXI'), logicalOperator: 'OR' },
          ],
        },
        { logicalOperator: 'AND', conditions: [row('connected.data.state', FilterOperation.Equals, 'DISCONNECTED')] },
      ];
      expect(groupsToLucene(groups, 'systems')).toBe('(alias:"*Test*" OR alias:"*PXI*") AND connected:"DISCONNECTED"');
    });
  });

  describe('parseLuceneGroups', () => {
    const roundTrips: [string, 'systems' | 'assets'][] = [
      ['alias:"*Test*" AND NOT connected:"CONNECTED"', 'systems'],
      ['(alias:"*Test*" OR alias:"*PXI*") AND connected:"DISCONNECTED"', 'systems'],
      ['(NOT _exists_:properties.Owner OR NOT properties.Owner:"admin")', 'systems'],
      ['"packages.ni-package-manager.version":[* TO "25"}', 'systems'],
      ['location.blank:false OR minionDetails.locked:true', 'systems'],
      ['minionDetails.systemStartTime:["2026-06-01T00:00:00Z" TO *]', 'systems'],
      ['(Location.MinionId:"x" OR Location.PhysicalLocation:"x") AND ModelNumber:[30689 TO *]', 'assets'],
      ['(NOT _exists_:PartNumber OR PartNumber:"") AND Keywords:"*CUst*"', 'assets'],
      ['Name:"PXI*" AND _exists_:"Properties.SOHC [%]"', 'assets'],
    ];

    roundTrips.forEach(([expression, kind]) => {
      it(`given___${expression}___when_parsed_and_rendered___then_round_trips`, () => {
        const { groups, complete } = parseLuceneGroups(expression, kind);
        expect(complete).toBeTrue();
        expect(normalizeFilterExpression(groupsToLucene(groups, kind, true) ?? '')).toBe(
          normalizeFilterExpression(expression),
        );
      });
    });

    it('given___a_known_field___when_parsed___then_maps_back_to_the_catalog_path', () => {
      const { groups } = parseLuceneGroups('minionDetails.localhost:"*lab*"', 'systems');
      expect(groups[0].conditions[0]).toEqual(
        jasmine.objectContaining({ property: 'string(grains.data.localhost)', operator: FilterOperation.Contains, value: 'lab' }),
      );
    });

    it('given___an_unknown_field___when_parsed___then_reports_incomplete', () => {
      expect(parseLuceneGroups('advancedGrains.cpuModel:"Intel"', 'systems').complete).toBeFalse();
    });
  });

  describe('normalizeFilterExpression', () => {
    it('given___word_and_symbol_operators___when_normalized___then_match', () => {
      expect(normalizeFilterExpression('a = "x y" and b = 1')).toBe(normalizeFilterExpression('a="x y" && b=1'));
    });
  });
});

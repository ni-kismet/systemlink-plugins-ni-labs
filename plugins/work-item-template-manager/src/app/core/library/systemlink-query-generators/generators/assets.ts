/**
 * Asset query generator — `POST /niapm/v1/query-assets`.
 *
 * Asset filter fields are PascalCase, unlike most other SystemLink services.
 *
 * @example
 * const query = assets()
 *   .equals('AssetType', 'DEVICE_UNDER_TEST')
 *   .equals('CalibrationStatus', 'PAST_RECOMMENDED_DUE_DATE')
 *   .contains('ModelName', 'PXIe')
 *   .orderBy('LAST_UPDATED_TIMESTAMP', { descending: true });
 *
 * await query.run(); // Asset[]
 */
import { DateStyle, FieldDef, FieldType, fieldDef, FieldEnumValue } from '../core/linq';
import { FilterValue, GeneratorSpec, QueryGenerator, QueryGeneratorOptions } from '../core/query-generator';

/** Values accepted by `AssetType`. */
export const AssetType = {
  Generic: 'GENERIC',
  DeviceUnderTest: 'DEVICE_UNDER_TEST',
  Fixture: 'FIXTURE',
  System: 'SYSTEM',
} as const;

/** An asset type value. */
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

/** Values accepted by `BusType`. */
export const AssetBusType = {
  BuiltInSystem: 'BUILT_IN_SYSTEM',
  PciPxi: 'PCI_PXI',
  Usb: 'USB',
  Gpib: 'GPIB',
  Vxi: 'VXI',
  Serial: 'SERIAL',
  TcpIp: 'TCP_IP',
  Crio: 'CRIO',
  Scxi: 'SCXI',
  Cdaq: 'CDAQ',
  SwitchBlock: 'SWITCH_BLOCK',
  Scc: 'SCC',
  FireWire: 'FIRE_WIRE',
  Accessory: 'ACCESSORY',
  Can: 'CAN',
  SwitchBlockDevice: 'SWITCH_BLOCK_DEVICE',
  Slsc: 'SLSC',
} as const;

/** An asset bus type value. */
export type AssetBusType = (typeof AssetBusType)[keyof typeof AssetBusType];

/** Values accepted by `CalibrationStatus`. */
export const AssetCalibrationStatus = {
  Ok: 'OK',
  ApproachingRecommendedDueDate: 'APPROACHING_RECOMMENDED_DUE_DATE',
  PastRecommendedDueDate: 'PAST_RECOMMENDED_DUE_DATE',
  OutForCalibration: 'OUT_FOR_CALIBRATION',
} as const;

/** An asset calibration status value. */
export type AssetCalibrationStatus = (typeof AssetCalibrationStatus)[keyof typeof AssetCalibrationStatus];

/** Values accepted by `Location.AssetState.SystemConnection`. */
export const AssetSystemConnection = {
  Disconnected: 'DISCONNECTED',
  Connected: 'CONNECTED',
} as const;

/** An asset system-connection value. */
export type AssetSystemConnection = (typeof AssetSystemConnection)[keyof typeof AssetSystemConnection];

/** Values accepted by `Location.AssetState.AssetPresence`. */
export const AssetPresence = {
  Initializing: 'INITIALIZING',
  Unknown: 'UNKNOWN',
  NotPresent: 'NOT_PRESENT',
  Present: 'PRESENT',
} as const;

/** An asset presence value. */
export type AssetPresence = (typeof AssetPresence)[keyof typeof AssetPresence];

/** Values accepted by `orderBy`. */
export const AssetOrderBy = {
  LastUpdatedTimestamp: 'LAST_UPDATED_TIMESTAMP',
  Id: 'ID',
} as const;

/** An asset `orderBy` value. */
export type AssetOrderBy = (typeof AssetOrderBy)[keyof typeof AssetOrderBy];

/** Maps an enum-like value object to selectable {@link FieldEnumValue}s. */
function enumValues(source: Record<string, string>): FieldEnumValue[] {
  return Object.values(source).map((value) => ({ label: value, value }));
}

/** Filterable fields documented by niapm for query-assets. */
export const assetFields: Record<string, FieldDef> = {
  AssetIdentifier: fieldDef('Asset ID', 'AssetIdentifier', FieldType.String),
  SerialNumber: fieldDef('Serial number', 'SerialNumber', FieldType.String),
  ModelName: fieldDef('Model name', 'ModelName', FieldType.String),
  ModelNumber: fieldDef('Model number', 'ModelNumber', FieldType.Number),
  VendorName: fieldDef('Vendor name', 'VendorName', FieldType.String),
  VendorNumber: fieldDef('Vendor number', 'VendorNumber', FieldType.Number),
  PartNumber: fieldDef('Part number', 'PartNumber', FieldType.String),
  AssetName: fieldDef('Asset name', 'AssetName', FieldType.String),
  AssetType: fieldDef('Asset type', 'AssetType', FieldType.Enum, { values: enumValues(AssetType) }),
  FirmwareVersion: fieldDef('Firmware version', 'FirmwareVersion', FieldType.String),
  HardwareVersion: fieldDef('Hardware version', 'HardwareVersion', FieldType.String),
  BusType: fieldDef('Bus type', 'BusType', FieldType.Enum, { values: enumValues(AssetBusType) }),
  IsNIAsset: fieldDef('Is NI asset', 'IsNIAsset', FieldType.Boolean),
  Keywords: fieldDef('Keywords', 'Keywords', FieldType.StringArray),
  Properties: fieldDef('Properties', 'Properties', FieldType.Properties),
  'Location.MinionId': fieldDef('System ID', 'Location.MinionId', FieldType.String),
  'Location.SlotNumber': fieldDef('Slot number', 'Location.SlotNumber', FieldType.Number),
  'Location.AssetState.SystemConnection': fieldDef(
    'System connection',
    'Location.AssetState.SystemConnection',
    FieldType.Enum,
    { values: enumValues(AssetSystemConnection) },
  ),
  'Location.AssetState.AssetPresence': fieldDef(
    'Asset presence',
    'Location.AssetState.AssetPresence',
    FieldType.Enum,
    { values: enumValues(AssetPresence) },
  ),
  SupportsSelfCalibration: fieldDef('Supports self calibration', 'SupportsSelfCalibration', FieldType.Boolean),
  'SelfCalibration.CalibrationDate': fieldDef('Self calibration date', 'SelfCalibration.CalibrationDate', FieldType.DateTime),
  SupportsExternalCalibration: fieldDef('Supports external calibration', 'SupportsExternalCalibration', FieldType.Boolean),
  CalibrationStatus: fieldDef('Calibration status', 'CalibrationStatus', FieldType.Enum, {
    values: enumValues(AssetCalibrationStatus),
  }),
  'ExternalCalibration.CalibrationDate': fieldDef('External calibration date', 'ExternalCalibration.CalibrationDate', FieldType.DateTime),
  'ExternalCalibration.NextRecommendedDate': fieldDef('Next recommended date', 'ExternalCalibration.NextRecommendedDate', FieldType.DateTime),
  'ExternalCalibration.RecommendedInterval': fieldDef('Recommended interval (months)', 'ExternalCalibration.RecommendedInterval', FieldType.Number),
  'ExternalCalibration.Comments': fieldDef('Calibration comments', 'ExternalCalibration.Comments', FieldType.String),
  'ExternalCalibration.IsLimited': fieldDef('Limited calibration', 'ExternalCalibration.IsLimited', FieldType.Boolean),
};

/** Fluent query generator for assets. */
export class AssetsQuery extends QueryGenerator {
  /** The niapm query-assets endpoint description. */
  public static override spec: GeneratorSpec = {
    resource: 'assets',
    url: '/niapm/v1/query-assets',
    method: 'POST',
    responseKey: 'assets',
    totalCountKey: 'totalCount',
    fields: assetFields,
    propertiesField: 'Properties',
    orderByValues: Object.values(AssetOrderBy),
    // niapm accepts both forms; the plain comparison is what its own
    // integration tests use.
    dateStyle: DateStyle.Compare,
    descendingKey: 'descending',
    paging: 'skip',
  };

  /** `Keywords.Contains("value")` */
  public override hasKeyword(value: FilterValue, field = 'Keywords'): this {
    return super.hasKeyword(value, field);
  }

  /** `!Keywords.Contains("value")` */
  public override lacksKeyword(value: FilterValue, field = 'Keywords'): this {
    return super.lacksKeyword(value, field);
  }

  /** Restricts results to assets that support calibration. */
  public calibratableOnly(enabled = true): this {
    this.state.calibratableOnly = enabled;
    return this;
  }

  /** Assembles the query-assets body, coercing projection to a string form. */
  protected override buildRequest(): Record<string, unknown> {
    const body = super.buildRequest();
    // This endpoint takes a projection *string*, e.g. 'new(AssetName, SerialNumber)'.
    const projection = body['projection'];
    if (Array.isArray(projection)) {
      body['projection'] = `new(${projection.join(', ')})`;
    }
    if (this.state.calibratableOnly !== undefined) {
      body['calibratableOnly'] = this.state.calibratableOnly;
    }
    delete body['continuationToken'];
    return body;
  }
}

/** Creates a new asset query generator. */
export function assets(options?: QueryGeneratorOptions): AssetsQuery {
  return new AssetsQuery(options);
}

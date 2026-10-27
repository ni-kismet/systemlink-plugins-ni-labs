import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  FilterDataType,
  FilterFieldDef,
  FilterFieldEnumValue,
  FilterOperation,
  fieldDef,
} from '../../library/systemlink-query-generators';
import { LocationService } from '../location/location.service';

/**
 * Builds the SystemLink filter-field definitions for the assets query builder.
 *
 * Returns a fresh array each call so callers can safely mutate per-field `values`
 * at runtime. Uses the standalone, dependency-free `fieldDef()` helper; operation
 * sets default to `defaultOperationsFor(dataType)` unless a field overrides them.
 */
export function createAssetFilterFields(locationValues: FilterFieldEnumValue[] = []): FilterFieldDef[] {
  // SystemLink's asset Location matches either the parent system or the physical location;
  // the slideout renders `Location` as that compound expression.
  const locationFields =
    locationValues.length > 0
      ? [
          fieldDef($localize`Location`, 'Location', FilterDataType.Enum, {
            values: locationValues,
            operations: [
              FilterOperation.Equals,
              FilterOperation.NotEquals,
              FilterOperation.IsEmpty,
              FilterOperation.IsNotEmpty,
            ],
          }),
        ]
      : [];

  return [
    fieldDef($localize`Asset identifier`, 'AssetIdentifier', FilterDataType.String),
    fieldDef($localize`Asset type`, 'AssetType', FilterDataType.Enum, {
      values: [
        { label: $localize`Generic`, value: 'GENERIC' },
        { label: $localize`Device under test`, value: 'DEVICE_UNDER_TEST' },
        { label: $localize`Fixture`, value: 'FIXTURE' },
        { label: $localize`System`, value: 'SYSTEM' },
      ],
    }),
    fieldDef($localize`Bus Type`, 'BusType', FilterDataType.Enum, {
      // Same labels and label sort as SystemLink Assets, so its translations apply.
      values: [
        { label: $localize`Built-in system`, value: 'BUILT_IN_SYSTEM' },
        { label: $localize`PXI/PCI`, value: 'PCI_PXI' },
        { label: $localize`USB`, value: 'USB' },
        { label: $localize`GPIB`, value: 'GPIB' },
        { label: $localize`VXI`, value: 'VXI' },
        { label: $localize`Serial`, value: 'SERIAL' },
        { label: $localize`TCP/IP`, value: 'TCP_IP' },
        { label: $localize`CompactRIO`, value: 'CRIO' },
        { label: $localize`SCXI`, value: 'SCXI' },
        { label: $localize`cDAQ`, value: 'CDAQ' },
        { label: $localize`SwitchBlock`, value: 'SWITCH_BLOCK' },
        { label: $localize`SCC`, value: 'SCC' },
        { label: $localize`FireWire`, value: 'FIRE_WIRE' },
        { label: $localize`Accessory`, value: 'ACCESSORY' },
        { label: $localize`CAN`, value: 'CAN' },
        { label: $localize`SwitchBlock device`, value: 'SWITCH_BLOCK_DEVICE' },
        { label: $localize`SLSC`, value: 'SLSC' },
      ].sort((a, b) => a.label.localeCompare(b.label)),
    }),
    fieldDef($localize`Calibration status`, 'CalibrationStatus', FilterDataType.Enum, {
      values: [
        { label: $localize`Calibration due soon`, value: 'APPROACHING_RECOMMENDED_DUE_DATE' },
        { label: $localize`Calibration past due`, value: 'PAST_RECOMMENDED_DUE_DATE' },
        { label: $localize`No action required`, value: 'OK' },
        { label: $localize`Out for calibration`, value: 'OUT_FOR_CALIBRATION' },
      ],
    }),
    fieldDef($localize`Calibration due date`, 'ExternalCalibration.NextRecommendedDate', FilterDataType.DateTime),
    fieldDef($localize`Last external calibration date`, 'ExternalCalibration.CalibrationDate', FilterDataType.DateTime),
    fieldDef($localize`Firmware Version`, 'FirmwareVersion', FilterDataType.String),
    fieldDef($localize`Hardware Version`, 'HardwareVersion', FilterDataType.String),
    fieldDef($localize`Is NI Asset`, 'IsNIAsset', FilterDataType.Boolean),
    fieldDef($localize`Keyword`, 'Keywords', FilterDataType.StringArray, {
      operations: [FilterOperation.Contains, FilterOperation.NotContains],
    }),
    ...locationFields,
    fieldDef($localize`Slot number`, 'Location.SlotNumber', FilterDataType.Number),
    fieldDef($localize`Presence`, 'Location.AssetState.AssetPresence', FilterDataType.Enum, {
      values: [
        { label: $localize`Not present`, value: 'NOT_PRESENT' },
        { label: $localize`Present`, value: 'PRESENT' },
      ],
    }),
    fieldDef($localize`System Connection`, 'Location.AssetState.SystemConnection', FilterDataType.Enum, {
      values: [
        { label: $localize`Connected`, value: 'CONNECTED' },
        { label: $localize`Disconnected`, value: 'DISCONNECTED' },
      ],
    }),
    fieldDef($localize`Model Name`, 'ModelName', FilterDataType.String),
    fieldDef($localize`Model Number`, 'ModelNumber', FilterDataType.Number),
    fieldDef($localize`Name`, 'AssetName', FilterDataType.String),
    fieldDef($localize`Part number`, 'PartNumber', FilterDataType.String),
    fieldDef($localize`Property`, 'Properties', FilterDataType.Properties),
    fieldDef($localize`Last self calibration date`, 'SelfCalibration.CalibrationDate', FilterDataType.DateTime),
    fieldDef($localize`Serial Number`, 'SerialNumber', FilterDataType.String),
    fieldDef($localize`Supports calibration`, 'SupportsAnyCalibration', FilterDataType.Boolean),
    fieldDef($localize`Supports external calibration`, 'SupportsExternalCalibration', FilterDataType.Boolean),
    fieldDef($localize`Supports Reset`, 'SupportsReset', FilterDataType.Boolean),
    fieldDef($localize`Supports self calibration`, 'SupportsSelfCalibration', FilterDataType.Boolean),
    fieldDef($localize`Supports Self Test`, 'SupportsSelfTest', FilterDataType.Boolean),
    fieldDef($localize`Vendor Name`, 'VendorName', FilterDataType.String),
    fieldDef($localize`Vendor Number`, 'VendorNumber', FilterDataType.Number),
    fieldDef($localize`Visa Resource Name`, 'VisaResourceName', FilterDataType.String),
    fieldDef($localize`Workspace`, 'workspace', FilterDataType.Enum, { values: [] }),
  ];
}

/** Business logic for assets query operations. */
@Injectable({
  providedIn: 'root',
})
export class AssetService {
  /** Creates an instance of AssetService. */
  public constructor(private readonly locationService: LocationService) {}

  /** Returns documented Assets Dynamic LINQ filter fields with types for query builder behavior. */
  public queryDistinctAssetFieldsByWorkspace(workspaceId: string): Observable<FilterFieldDef[]> {
    void workspaceId;
    return this.locationService
      .getAssetLocationFilterValues()
      .pipe(map((locations) => createAssetFilterFields(locations)));
  }
}

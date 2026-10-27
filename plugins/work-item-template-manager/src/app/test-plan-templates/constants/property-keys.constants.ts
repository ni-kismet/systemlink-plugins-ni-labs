/** Reserved property keys for file configuration and file metadata on templates.
 *  These are managed by the file configuration UI and hidden from the custom properties list. */
export const FILE_PROPERTY_KEYS = {
  testProgram: 'test_program_path',
  batteryFile: 'battery_file_path',
  customMapping: 'custom_mapping_file',
  mappingFile: 'mapping_file_path',
  fileId: 'file_id',
  fileName: 'file_name',
  fileSize: 'file_size',
} as const;

/** Prefix used when persisting parsed global parameter values as template custom properties. */
export const GLOBAL_PARAM_PREFIX = 'global_param#';

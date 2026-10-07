/** Import limits shared by browser uploads, the dialog, and the backend proxy. */
export const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024
export const MAX_IMPORT_OVERRIDES_BYTES = 64 * 1024
// Includes mapping JSON, other fields, filenames, and multipart framing.
export const MAX_IMPORT_REQUEST_BYTES = MAX_IMPORT_FILE_BYTES + 128 * 1024

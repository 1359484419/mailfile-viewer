// pst-extractor only touches fs when given a file path; the browser build always passes a Buffer.
const unsupported = () => { throw new Error('File system access is not available in the browser build'); };
export const openSync = unsupported;
export const readSync = unsupported;
export const closeSync = () => {};
export default { openSync, readSync, closeSync };

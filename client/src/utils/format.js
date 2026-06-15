/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
/**
 * Format a transfer speed in bytes/second to MB/s or KB/s string.
 * @param {number} bytesPerSec
 * @returns {string}
 */
export function formatSpeed(bytesPerSec) {
  if (bytesPerSec <= 0 || !isFinite(bytesPerSec)) return '— KB/s';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}
/**
 * Format remaining seconds into a countdown.
 * e.g. 90 → "1 min 30 sec", 5 → "5 sec"
 * @param {number} seconds
 * @returns {string}
 */
export function formatETA(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.ceil(seconds)} sec`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m} min ${s} sec`;
}
/**
 * Returns a file-type category label from a MIME type.
 * @param {string} mimeType
 * @returns {string}
 */
export function getFileTypeLabel(mimeType) {
  if (!mimeType) return 'File';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.startsWith('text/')) return 'Text';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return 'Archive';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Document';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Spreadsheet';
  return 'File';
}
/**
 * @param {string} label
 * @returns {string}
 */
export function getFileTypeIcon(label) {
  const icons = {
    Image: '🖼️',
    Video: '🎬',
    Audio: '🎵',
    Text: '📄',
    PDF: '📕',
    Archive: '🗜️',
    Document: '📝',
    Spreadsheet: '📊',
    File: '📁',
  };
  return icons[label] || '📁';
}

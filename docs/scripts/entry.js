
console.log(`BUNDLE VERSION: ${new Date().toISOString()}`);
import { initCRDT } from './crdt-client.js';
import DOMPurify from 'dompurify';

window.initCRDT = initCRDT;
window.sanitizeHtml = (html) => DOMPurify.sanitize(html || '');

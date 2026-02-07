
console.log(`BUNDLE VERSION: ${new Date().toISOString()}`);
import { initCRDT } from './crdt-client.js';

window.initCRDT = initCRDT;

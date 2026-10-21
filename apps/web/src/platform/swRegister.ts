/** The one place the plugin's virtual module is imported, so Node tests of updates.ts never need it. */
export { registerSW } from 'virtual:pwa-register';

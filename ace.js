/**
 * JavaScript entrypoint for running Ace commands.
 *
 * Keep this file framework-owned. Application-specific command wiring belongs
 * in bin/console.ts and commands/.
 */
import '@poppinss/ts-exec'

await import('./bin/console.js')

// Loaded first in the sandbox (node --import): the import hook that keeps designs to their own imports. In-thread
// (module.registerHooks) where Node has it; older Node runs hooks in a worker, which the sandbox then allows.
import * as mod from 'node:module';
import { resolveHook, initialize } from './sandbox-hooks.mjs';

const project = process.env.CAD_SANDBOX_PROJECT;
if (mod.registerHooks) {
  initialize({ project });
  mod.registerHooks({ resolve: resolveHook });
} else mod.register('./sandbox-hooks.mjs', import.meta.url, { data: { project } });

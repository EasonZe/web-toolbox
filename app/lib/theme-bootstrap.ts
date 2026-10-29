import { createAppearance } from "./appearance";

// No saved value is inserted into HTML. Values are read and validated only
// when this script executes; settings use the identical palette rules.
export const themeBootstrap = `(${createAppearance.toString()})().initialize();`;

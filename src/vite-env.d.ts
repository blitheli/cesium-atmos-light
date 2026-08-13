/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

declare module "*.frag?raw" {
  const src: string;
  export default src;
}

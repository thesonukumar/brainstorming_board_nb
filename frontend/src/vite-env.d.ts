/// <reference types="vite/client" />

// Optional: declare your specific env vars for better intellisense
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

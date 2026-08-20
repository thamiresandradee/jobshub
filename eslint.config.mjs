import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Os data-fetching effects deste app seguem o padrão clássico do React
      // (setLoading/setState direto no corpo do effect), que é exatamente o
      // exemplo usado na própria documentação do React. Essa regra nova é
      // pensada para o futuro React Compiler e é rígida demais pro que
      // precisamos aqui — mantemos como aviso, não erro de build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
